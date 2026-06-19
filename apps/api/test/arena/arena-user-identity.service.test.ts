import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ArenaUserIdentityService } from "../../src/arena/services/arena-user-identity.service";
import type { ArenaUserRepository } from "../../src/arena/repositories/arena-user.repository";

class FakeArenaUserRepository {
  readonly created: Array<{
    id: string;
    primaryWalletAddress: string | null;
    normalizedPrimaryWalletAddress: string | null;
    status: "active";
  }> = [];

  readonly byId = new Map<
    string,
    {
      id: string;
      primaryWalletAddress: string | null;
      normalizedPrimaryWalletAddress: string | null;
      status: "active";
    }
  >();

  async findById(userId: string) {
    return this.byId.get(userId) ?? null;
  }

  async create(input: {
    id: string;
    primaryWalletAddress: string | null;
    normalizedPrimaryWalletAddress: string | null;
    status: "active";
  }) {
    this.created.push(input);
    this.byId.set(input.id, input);
    return input;
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
    } as const;
    this.byId.set(userId, updated);
    return updated;
  }
}

class FakeRewardPayoutService {
  readonly backfilledUserIds: string[] = [];

  async backfillMissingPayoutsForUser(userId: string) {
    this.backfilledUserIds.push(userId);
    return [];
  }
}

describe("ArenaUserIdentityService", () => {
  it("creates a placeholder user when a non-wallet user id is first encountered", async () => {
    const repository = new FakeArenaUserRepository();
    const rewardPayouts = new FakeRewardPayoutService();
    const service = new ArenaUserIdentityService(
      repository as unknown as ArenaUserRepository,
      rewardPayouts as any,
    );

    const user = await service.ensureUserExists("user-1");

    assert.equal(user.id, "user-1");
    assert.equal(repository.created.length, 1);
    assert.equal(repository.created[0]?.primaryWalletAddress, null);
    assert.equal(repository.created[0]?.normalizedPrimaryWalletAddress, null);
    assert.deepEqual(rewardPayouts.backfilledUserIds, []);
  });

  it("creates a wallet-backed user record when wallet context is available", async () => {
    const repository = new FakeArenaUserRepository();
    const rewardPayouts = new FakeRewardPayoutService();
    const service = new ArenaUserIdentityService(
      repository as unknown as ArenaUserRepository,
      rewardPayouts as any,
    );

    const user = await service.ensureUserExists(
      "0xAbC0000000000000000000000000000000000001".toLowerCase(),
      {
        walletAddress: "0xAbC0000000000000000000000000000000000001",
      },
    );

    assert.equal(user.id, "0xabc0000000000000000000000000000000000001");
    assert.equal(repository.created.length, 1);
    assert.equal(
      repository.created[0]?.primaryWalletAddress,
      "0xAbC0000000000000000000000000000000000001",
    );
    assert.equal(
      repository.created[0]?.normalizedPrimaryWalletAddress,
      "0xabc0000000000000000000000000000000000001",
    );
    assert.deepEqual(rewardPayouts.backfilledUserIds, [
      "0xabc0000000000000000000000000000000000001",
    ]);
  });

  it("reuses an existing user without creating duplicates", async () => {
    const repository = new FakeArenaUserRepository();
    const rewardPayouts = new FakeRewardPayoutService();
    await repository.create({
      id: "user-existing",
      primaryWalletAddress: null,
      normalizedPrimaryWalletAddress: null,
      status: "active",
    });
    const service = new ArenaUserIdentityService(
      repository as unknown as ArenaUserRepository,
      rewardPayouts as any,
    );

    const user = await service.ensureUserExists("user-existing");

    assert.equal(user.id, "user-existing");
    assert.equal(repository.created.length, 1);
    assert.deepEqual(rewardPayouts.backfilledUserIds, []);
  });

  it("backfills a primary wallet for an existing placeholder user and triggers payout backfill", async () => {
    const repository = new FakeArenaUserRepository();
    const rewardPayouts = new FakeRewardPayoutService();
    await repository.create({
      id: "user-existing",
      primaryWalletAddress: null,
      normalizedPrimaryWalletAddress: null,
      status: "active",
    });
    const service = new ArenaUserIdentityService(
      repository as unknown as ArenaUserRepository,
      rewardPayouts as any,
    );

    const user = await service.ensureUserExists("user-existing", {
      walletAddress: "0xAbC0000000000000000000000000000000000002",
    });

    assert.equal(user.id, "user-existing");
    assert.equal(
      user.primaryWalletAddress,
      "0xAbC0000000000000000000000000000000000002",
    );
    assert.equal(
      user.normalizedPrimaryWalletAddress,
      "0xabc0000000000000000000000000000000000002",
    );
    assert.equal(repository.created.length, 1);
    assert.deepEqual(rewardPayouts.backfilledUserIds, ["user-existing"]);
  });
});
