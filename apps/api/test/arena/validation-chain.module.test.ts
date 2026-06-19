import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ArenaUserIdentityService } from "../../src/arena/services/arena-user-identity.service";
import type { ArenaUserRepository } from "../../src/arena/repositories/arena-user.repository";

class FakeArenaUserRepository {
  async findById() {
    return null;
  }

  async create(input: {
    id: string;
    primaryWalletAddress: string | null;
    normalizedPrimaryWalletAddress: string | null;
    status: "active";
  }) {
    return input;
  }

  async updatePrimaryWalletAddress(userId: string, walletAddress: string) {
    return {
      id: userId,
      primaryWalletAddress: walletAddress,
      normalizedPrimaryWalletAddress: walletAddress.toLowerCase(),
      status: "active" as const,
    };
  }
}

describe("ArenaUserIdentityService lightweight injection", () => {
  it("keeps user existence backfill available even when reward payout wiring is absent", async () => {
    const service = new ArenaUserIdentityService(
      new FakeArenaUserRepository() as unknown as ArenaUserRepository,
    );

    const user = await service.ensureUserExists("validation-actor-user");

    assert.equal(user.id, "validation-actor-user");
    assert.equal(user.primaryWalletAddress, null);
    assert.equal(user.normalizedPrimaryWalletAddress, null);
  });
});
