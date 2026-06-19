import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SystemRole } from "@arena/shared";

import { AuthService } from "../../src/auth/auth.service";
import type { StoredChallenge } from "../../src/auth/auth-challenge.store";
import type { ArenaIdService } from "../../src/arena/arena-id.service";
import type { AppConfigService } from "../../src/config/app-config.service";
import type { ArenaUserRepository } from "../../src/arena/repositories/arena-user.repository";
import type { ArenaUserSessionRepository } from "../../src/arena/repositories/arena-user-session.repository";
import type { ArenaUserWalletRepository } from "../../src/arena/repositories/arena-user-wallet.repository";

const PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f094538e44d6be8b7e9b8a7f2e5e5d7e5d6f9d90";
const CHAIN_ID = 1337;

function createConfigStub(
  overrides: Partial<Pick<AppConfigService, "chainId" | "jwtSecret">> = {},
): AppConfigService {
  return {
    chainId: overrides.chainId ?? CHAIN_ID,
    jwtSecret: overrides.jwtSecret ?? "test-secret-value-1234567890",
    authChallengeTtlSeconds: 300,
    resolveRolesForWallet: () => [SystemRole.User],
  } as unknown as AppConfigService;
}

class FakeJwtService {
  readonly payloads: unknown[] = [];

  async signAsync(payload: unknown): Promise<string> {
    this.payloads.push(payload);
    return "signed-token";
  }
}

class FakeChallengeStore {
  private challenge: StoredChallenge | null = null;
  readonly cleared: Array<{ walletAddress: string; chainId: number }> = [];

  async save(challenge: StoredChallenge): Promise<void> {
    this.challenge = challenge;
  }

  async load(): Promise<StoredChallenge | null> {
    return this.challenge;
  }

  async clear(walletAddress: string, chainId: number): Promise<void> {
    this.cleared.push({ walletAddress, chainId });
    this.challenge = null;
  }
}

class FakeArenaUserRepository {
  readonly created: Array<{ id: string; primaryWalletAddress: string }> = [];
  readonly byId = new Map<
    string,
    {
      id: string;
      primaryWalletAddress: string | null;
      normalizedPrimaryWalletAddress?: string | null;
    }
  >();

  async findById(userId: string) {
    return this.byId.get(userId) ?? null;
  }

  async findByNormalizedPrimaryWalletAddress(
    normalizedPrimaryWalletAddress: string,
  ) {
    for (const user of this.byId.values()) {
      if (
        user.normalizedPrimaryWalletAddress?.toLowerCase() ===
        normalizedPrimaryWalletAddress.toLowerCase()
      ) {
        return user;
      }
    }

    return null;
  }

  async create(input: {
    id: string;
    primaryWalletAddress: string | null;
    normalizedPrimaryWalletAddress?: string | null;
  }) {
    const created = {
      id: input.id,
      primaryWalletAddress: input.primaryWalletAddress,
      normalizedPrimaryWalletAddress:
        input.normalizedPrimaryWalletAddress ??
        input.primaryWalletAddress?.toLowerCase() ??
        null,
    };
    this.created.push(created);
    this.byId.set(created.id, created);
    return created;
  }

  async updatePrimaryWalletAddress(userId: string, walletAddress: string) {
    const existing = this.byId.get(userId);
    if (!existing) {
      throw new Error(`User ${userId} not found`);
    }

    const updated = {
      ...existing,
      primaryWalletAddress: walletAddress,
      normalizedPrimaryWalletAddress: walletAddress.toLowerCase(),
    };
    this.byId.set(userId, updated);
    return updated;
  }

  async touchLastLogin(userId: string) {
    return this.byId.get(userId) ?? null;
  }
}

class FakeArenaUserWalletRepository {
  readonly created: Array<{
    userId: string;
    walletAddress: string;
    normalizedWalletAddress: string;
    chainId: number;
  }> = [];
  readonly byWallet = new Map<string, {
    userId: string;
    walletAddress: string;
    normalizedWalletAddress: string;
    chainId: number;
  }>();
  failNextCreateWithUniqueConflict = false;

  private key(walletAddress: string, chainId: number) {
    return `${chainId}:${walletAddress.toLowerCase()}`;
  }

  async findByWalletAddress(walletAddress: string, chainId: number) {
    return this.byWallet.get(this.key(walletAddress, chainId)) ?? null;
  }

  async create(input: {
    userId: string;
    walletAddress: string;
    normalizedWalletAddress: string;
    chainId: number;
  }) {
    if (this.failNextCreateWithUniqueConflict) {
      this.failNextCreateWithUniqueConflict = false;
      this.byWallet.set(this.key(input.walletAddress, input.chainId), input);
      throw {
        code: "P2002",
      };
    }

    this.created.push(input);
    this.byWallet.set(this.key(input.walletAddress, input.chainId), input);
    return input;
  }
}

class FakeArenaUserSessionRepository {
  readonly created: Array<{
    userId: string;
    walletAddress: string;
    chainId: number;
    accessToken: string;
  }> = [];

  async create(input: {
    userId: string;
    walletAddress: string;
    chainId: number;
    accessToken: string;
  }) {
    this.created.push(input);
    return input;
  }
}

class FakeRewardPayoutService {
  readonly backfilledUserIds: string[] = [];

  async backfillMissingPayoutsForUser(userId: string) {
    this.backfilledUserIds.push(userId);
    return [];
  }
}

class FakeArenaIdService {
  private sequence = 0;

  next(namespace: string) {
    this.sequence += 1;
    return `${namespace}_${this.sequence}`;
  }
}

class FakePrismaTransactionRunner {
  async $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    return callback({} as never);
  }
}

describe("AuthService user identity persistence", () => {
  it("creates an independent user master record, wallet binding, and session on first successful login", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(users.created.length, 1);
    assert.equal(users.created[0]?.id, "user_1");
    assert.equal(wallets.created.length, 1);
    assert.equal(wallets.created[0]?.userId, "user_1");
    assert.equal(sessions.created.length, 1);
    assert.equal(sessions.created[0]?.userId, "user_1");
    assert.equal(result.accessToken, "signed-token");
    assert.equal(result.identity.sub, users.created[0]?.id);
    assert.equal(result.identity.sub, "user_1");
    assert.notEqual(result.identity.sub, wallet.address.toLowerCase());
    assert.equal(result.identity.walletAddress, wallet.address);
    assert.deepEqual(result.identity.roles, [SystemRole.User]);
    assert.deepEqual(rewardPayouts.backfilledUserIds, ["user_1"]);
    assert.deepEqual(challengeStore.cleared, [
      { walletAddress: wallet.address, chainId: CHAIN_ID },
    ]);
  });

  it("reuses the existing user and wallet binding on repeated login while creating a new session", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    const existingUserId = wallet.address.toLowerCase();
    await users.create({
      id: existingUserId,
      primaryWalletAddress: wallet.address,
    });
    await wallets.create({
      userId: existingUserId,
      walletAddress: wallet.address,
      normalizedWalletAddress: wallet.address.toLowerCase(),
      chainId: CHAIN_ID,
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(users.created.length, 1);
    assert.equal(wallets.created.length, 1);
    assert.equal(sessions.created.length, 1);
    assert.equal(result.identity.sub, existingUserId);
  });

  it("repairs the user master primary wallet fields when a wallet binding already exists", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    const existingUserId = wallet.address.toLowerCase();
    await users.create({
      id: existingUserId,
      primaryWalletAddress: null,
      normalizedPrimaryWalletAddress: null,
    });
    await wallets.create({
      userId: existingUserId,
      walletAddress: wallet.address,
      normalizedWalletAddress: wallet.address.toLowerCase(),
      chainId: CHAIN_ID,
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(result.identity.sub, existingUserId);
    assert.equal(wallets.created.length, 1);
    assert.equal(sessions.created.length, 1);
    assert.equal(
      users.byId.get(existingUserId)?.primaryWalletAddress,
      wallet.address,
    );
    assert.equal(
      users.byId.get(existingUserId)?.normalizedPrimaryWalletAddress,
      wallet.address.toLowerCase(),
    );
    assert.deepEqual(rewardPayouts.backfilledUserIds, [existingUserId]);
  });

  it("upgrades an existing placeholder user with the verified primary wallet on login", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    const placeholderUserId = wallet.address.toLowerCase();
    await users.create({
      id: placeholderUserId,
      primaryWalletAddress: null,
      normalizedPrimaryWalletAddress: null,
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(users.created.length, 1);
    assert.equal(wallets.created.length, 1);
    assert.equal(sessions.created.length, 1);
    assert.equal(
      users.byId.get(placeholderUserId)?.primaryWalletAddress,
      wallet.address,
    );
    assert.equal(result.identity.sub, placeholderUserId);
  });

  it("reuses an existing user master record keyed independently from the wallet when the wallet binding row is missing", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    await users.create({
      id: "respondent_master_1",
      primaryWalletAddress: wallet.address,
      normalizedPrimaryWalletAddress: wallet.address.toLowerCase(),
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(users.created.length, 1);
    assert.equal(wallets.created.length, 1);
    assert.equal(wallets.created[0]?.userId, "respondent_master_1");
    assert.equal(sessions.created.length, 1);
    assert.equal(sessions.created[0]?.userId, "respondent_master_1");
    assert.equal(result.identity.sub, "respondent_master_1");
  });

  it("backfills missing reward payouts after a wallet-backed login upgrades the user identity", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    await users.create({
      id: wallet.address.toLowerCase(),
      primaryWalletAddress: null,
      normalizedPrimaryWalletAddress: null,
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(result.identity.sub, wallet.address.toLowerCase());
    assert.deepEqual(rewardPayouts.backfilledUserIds, [
      wallet.address.toLowerCase(),
    ]);
  });

  it("keeps legacy wallet-address user ids compatible while new wallet logins get independent ids", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();

    await users.create({
      id: wallet.address.toLowerCase(),
      primaryWalletAddress: wallet.address,
      normalizedPrimaryWalletAddress: wallet.address.toLowerCase(),
    });

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(result.identity.sub, wallet.address.toLowerCase());
    assert.equal(users.created.length, 1);
    assert.equal(wallets.created.length, 1);
    assert.equal(wallets.created[0]?.userId, wallet.address.toLowerCase());
  });

  it("recovers from a concurrent wallet-binding unique conflict by reusing the committed binding", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const config = createConfigStub();
    const jwtService = new FakeJwtService();
    const challengeStore = new FakeChallengeStore();
    const ids = new FakeArenaIdService();
    const users = new FakeArenaUserRepository();
    const wallets = new FakeArenaUserWalletRepository();
    const sessions = new FakeArenaUserSessionRepository();
    const rewardPayouts = new FakeRewardPayoutService();
    const prisma = new FakePrismaTransactionRunner();

    await users.create({
      id: "respondent_master_1",
      primaryWalletAddress: wallet.address,
      normalizedPrimaryWalletAddress: wallet.address.toLowerCase(),
    });
    wallets.failNextCreateWithUniqueConflict = true;

    const service = new AuthService(
      config,
      jwtService as never,
      challengeStore as never,
      ids as unknown as ArenaIdService,
      users as unknown as ArenaUserRepository,
      wallets as unknown as ArenaUserWalletRepository,
      sessions as unknown as ArenaUserSessionRepository,
      rewardPayouts as never,
      prisma as never,
    );

    const challenge = await service.createChallenge(wallet.address, CHAIN_ID);
    const signature = await wallet.signMessage(challenge.message);
    const result = await service.verifySignature(wallet.address, CHAIN_ID, signature);

    assert.equal(result.identity.sub, "respondent_master_1");
    assert.equal(sessions.created.length, 1);
    assert.equal(sessions.created[0]?.userId, "respondent_master_1");
  });
});
