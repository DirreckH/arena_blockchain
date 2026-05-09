import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

import type { AuthChallengeResponse, JwtIdentity } from "@arena/shared";

import { AppConfigService } from "../config/app-config.service";
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

    const identity: JwtIdentity = {
      sub: normalizedWalletAddress.toLowerCase(),
      walletAddress: normalizedWalletAddress,
      chainId,
      roles: this.config.resolveRolesForWallet(normalizedWalletAddress),
    };

    await this.challengeStore.clear(normalizedWalletAddress, chainId);

    const accessToken = await this.jwtService.signAsync(identity, {
      secret: this.config.jwtSecret,
    });

    return {
      accessToken,
      identity,
    };
  }

  private normalizeAddress(walletAddress: string): string {
    try {
      return ethers.utils.getAddress(walletAddress);
    } catch {
      throw new BadRequestException("Invalid wallet address");
    }
  }
}
