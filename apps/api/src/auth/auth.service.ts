import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

import type { AuthChallengeResponse, JwtIdentity } from "@arena/shared";

import { ArenaIdService } from "../arena/arena-id.service";
import {
  isUniqueConstraintError,
  withArenaTransaction,
} from "../arena/arena-transaction.utils";
import type { ArenaDbClient } from "../arena/prisma.types";
import { ArenaUserRepository } from "../arena/repositories/arena-user.repository";
import { ArenaUserSessionRepository } from "../arena/repositories/arena-user-session.repository";
import { ArenaUserWalletRepository } from "../arena/repositories/arena-user-wallet.repository";
import { RewardPayoutService } from "../arena/services/reward-payout.service";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../database/prisma.service";
import { AuthChallengeStore } from "./auth-challenge.store";

export interface AuthTokenResponse {
  accessToken: string;
  identity: JwtIdentity;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly jwtService: JwtService,
    private readonly challengeStore: AuthChallengeStore,
    private readonly ids: ArenaIdService,
    private readonly users: ArenaUserRepository,
    private readonly userWallets: ArenaUserWalletRepository,
    private readonly userSessions: ArenaUserSessionRepository,
    private readonly rewardPayouts: RewardPayoutService,
    private readonly prisma?: PrismaService,
  ) {}

  async createChallenge(
    walletAddress: string,
    chainId: number,
  ): Promise<AuthChallengeResponse> {
    const normalizedWalletAddress = this.normalizeAddress(walletAddress);

    if (chainId !== this.config.chainId) {
      throw new BadRequestException("Unsupported chain id");
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.authChallengeTtlSeconds * 1000,
    );
    const nonce = randomBytes(16).toString("hex");
    const message = [
      "Arena Authentication Challenge",
      "",
      `Wallet: ${normalizedWalletAddress}`,
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${now.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      "",
      "Sign this message to authenticate with Arena.",
    ].join("\n");

    await this.challengeStore.save(
      {
        walletAddress: normalizedWalletAddress,
        chainId,
        nonce,
        message,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      this.config.authChallengeTtlSeconds,
    );

    return {
      walletAddress: normalizedWalletAddress,
      chainId,
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifySignature(
    walletAddress: string,
    chainId: number,
    signature: string,
  ): Promise<AuthTokenResponse> {
    const normalizedWalletAddress = this.normalizeAddress(walletAddress);

    if (chainId !== this.config.chainId) {
      throw new BadRequestException("Unsupported chain id");
    }

    const challenge = await this.challengeStore.load(normalizedWalletAddress, chainId);
    if (!challenge) {
      throw new UnauthorizedException("Challenge not found or expired");
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      await this.challengeStore.clear(normalizedWalletAddress, chainId);
      throw new UnauthorizedException("Challenge has expired");
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = this.normalizeAddress(
        ethers.utils.verifyMessage(challenge.message, signature),
      );
    } catch {
      throw new UnauthorizedException("Invalid signature");
    }

    if (recoveredAddress !== normalizedWalletAddress) {
      throw new UnauthorizedException("Signature does not match wallet address");
    }

    const user = await this.findOrCreateUser(normalizedWalletAddress, chainId);
    const identity: JwtIdentity = {
      sub: user.id,
      walletAddress: normalizedWalletAddress,
      chainId,
      roles: this.config.resolveRolesForWallet(normalizedWalletAddress),
    };

    await this.challengeStore.clear(normalizedWalletAddress, chainId);

    const accessToken = await this.jwtService.signAsync(identity, {
      secret: this.config.jwtSecret,
    });

    await this.userSessions.create({
      id: this.ids.next("user_session"),
      userId: user.id,
      walletAddress: normalizedWalletAddress,
      chainId,
      accessToken,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await this.rewardPayouts.backfillMissingPayoutsForUser(user.id);

    return {
      accessToken,
      identity,
    };
  }

  private async findOrCreateUser(
    normalizedWalletAddress: string,
    chainId: number,
  ): Promise<{ id: string }> {
    if (!this.prisma) {
      return this.findOrCreateUserInDb(normalizedWalletAddress, chainId);
    }

    try {
      return await withArenaTransaction(this.prisma, undefined, async (tx) =>
        this.findOrCreateUserInDb(normalizedWalletAddress, chainId, tx),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      return this.recoverConcurrentUserBinding(
        normalizedWalletAddress,
        chainId,
      );
    }
  }

  private async findOrCreateUserInDb(
    normalizedWalletAddress: string,
    chainId: number,
    db?: ArenaDbClient,
  ): Promise<{ id: string }> {
    const normalizedWalletAddressLower =
      normalizedWalletAddress.toLowerCase();
    const existingWallet = await this.userWallets.findByWalletAddress(
      normalizedWalletAddressLower,
      chainId,
      db,
    );

    if (existingWallet) {
      await this.repairAndTouchUser(
        existingWallet.userId,
        normalizedWalletAddress,
        db,
      );
      return { id: existingWallet.userId };
    }

    const existingPrimaryWalletUser =
      await this.users.findByNormalizedPrimaryWalletAddress(
        normalizedWalletAddressLower,
        db,
      );
    if (existingPrimaryWalletUser) {
      await this.users.touchLastLogin(existingPrimaryWalletUser.id, db);
      await this.userWallets.create(
        this.buildWalletBindingInput(
          existingPrimaryWalletUser.id,
          normalizedWalletAddress,
          normalizedWalletAddressLower,
          chainId,
        ),
        db,
      );

      return { id: existingPrimaryWalletUser.id };
    }

    const legacyWalletUserId = normalizedWalletAddressLower;
    const existingUser = await this.users.findById(legacyWalletUserId, db);

    if (existingUser) {
      await this.repairAndTouchUser(
        legacyWalletUserId,
        normalizedWalletAddress,
        db,
      );
      await this.userWallets.create(
        this.buildWalletBindingInput(
          legacyWalletUserId,
          normalizedWalletAddress,
          normalizedWalletAddressLower,
          chainId,
        ),
        db,
      );

      return { id: legacyWalletUserId };
    }

    const userId = this.ids.next("user");
    await this.users.create(
      {
        id: userId,
        primaryWalletAddress: normalizedWalletAddress,
        normalizedPrimaryWalletAddress: normalizedWalletAddressLower,
        status: "active",
        createdAt: new Date(),
        lastLoginAt: new Date(),
      },
      db,
    );

    await this.userWallets.create(
      this.buildWalletBindingInput(
        userId,
        normalizedWalletAddress,
        normalizedWalletAddressLower,
        chainId,
      ),
      db,
    );

    return { id: userId };
  }

  private async recoverConcurrentUserBinding(
    normalizedWalletAddress: string,
    chainId: number,
  ): Promise<{ id: string }> {
    const normalizedWalletAddressLower =
      normalizedWalletAddress.toLowerCase();
    const existingWallet = await this.userWallets.findByWalletAddress(
      normalizedWalletAddressLower,
      chainId,
    );

    if (existingWallet) {
      await this.repairAndTouchUser(
        existingWallet.userId,
        normalizedWalletAddress,
      );
      return { id: existingWallet.userId };
    }

    const existingPrimaryWalletUser =
      await this.users.findByNormalizedPrimaryWalletAddress(
        normalizedWalletAddressLower,
      );

    if (!existingPrimaryWalletUser) {
      throw new UnauthorizedException(
        "User identity could not be recovered after a concurrent wallet-binding conflict",
      );
    }

    await this.users.touchLastLogin(existingPrimaryWalletUser.id);
    try {
      await this.userWallets.create(
        this.buildWalletBindingInput(
          existingPrimaryWalletUser.id,
          normalizedWalletAddress,
          normalizedWalletAddressLower,
          chainId,
        ),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const confirmedWallet = await this.userWallets.findByWalletAddress(
      normalizedWalletAddressLower,
      chainId,
    );

    return { id: confirmedWallet?.userId ?? existingPrimaryWalletUser.id };
  }

  private buildWalletBindingInput(
    userId: string,
    walletAddress: string,
    normalizedWalletAddress: string,
    chainId: number,
  ) {
    return {
      id: this.ids.next("user_wallet"),
      userId,
      walletAddress,
      normalizedWalletAddress,
      chainId,
      isPrimary: true,
      verifiedAt: new Date(),
      createdAt: new Date(),
    };
  }

  private async repairAndTouchUser(
    userId: string,
    normalizedWalletAddress: string,
    db?: ArenaDbClient,
  ): Promise<void> {
    const existingUser = await this.users.findById(userId, db);
    if (
      existingUser &&
      (existingUser.primaryWalletAddress === null ||
        existingUser.normalizedPrimaryWalletAddress === null)
    ) {
      await this.users.updatePrimaryWalletAddress(
        userId,
        normalizedWalletAddress,
        db,
      );
    }

    await this.users.touchLastLogin(userId, db);
  }

  private normalizeAddress(walletAddress: string): string {
    try {
      return ethers.utils.getAddress(walletAddress);
    } catch {
      throw new BadRequestException("Invalid wallet address");
    }
  }
}
