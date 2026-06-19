import { Injectable, Optional } from "@nestjs/common";
import type { User } from "@prisma/client";

import type { ArenaDbClient } from "../prisma.types";
import { ArenaUserRepository } from "../repositories/arena-user.repository";
import { RewardPayoutService } from "./reward-payout.service";

@Injectable()
export class ArenaUserIdentityService {
  constructor(
    private readonly users: ArenaUserRepository,
    @Optional()
    private readonly rewardPayouts?: RewardPayoutService,
  ) {}

  async ensureUserExists(
    userId: string,
    options?: {
      walletAddress?: string | null;
    },
    db?: ArenaDbClient,
  ): Promise<User> {
    const existing = await this.users.findById(userId, db);
    const normalizedWalletAddress = options?.walletAddress
      ? options.walletAddress.toLowerCase()
      : null;

    if (existing) {
      if (
        normalizedWalletAddress &&
        (existing.primaryWalletAddress === null ||
          existing.normalizedPrimaryWalletAddress === null)
      ) {
        const updated = await this.users.updatePrimaryWalletAddress(
          userId,
          options!.walletAddress!,
          db,
        );
        await this.rewardPayouts?.backfillMissingPayoutsForUser(userId, db);
        return updated;
      }

      return existing;
    }

    const created = await this.users.create(
      {
        id: userId,
        primaryWalletAddress: options?.walletAddress ?? null,
        normalizedPrimaryWalletAddress: normalizedWalletAddress,
        status: "active",
      },
      db,
    );
    if (normalizedWalletAddress) {
      await this.rewardPayouts?.backfillMissingPayoutsForUser(userId, db);
    }

    return created;
  }
}
