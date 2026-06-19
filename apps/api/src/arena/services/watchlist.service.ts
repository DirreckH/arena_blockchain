import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  RespondentWatchlistItemViewModel,
  RespondentWatchlistViewModel,
  UpdateRespondentWatchlistInput,
  UpdateRespondentWatchlistResultViewModel,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import { ArenaNotFoundError } from "../arena.errors";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

type StoredWatchlistItem = {
  marketId: string;
  propositionId: string;
  savedAt: string;
};

const WATCHLIST_NAMESPACE = "arena.watchlist";

function cloneItems(items: StoredWatchlistItem[]): StoredWatchlistItem[] {
  return structuredClone(items);
}

function parseStoredItems(value: unknown): StoredWatchlistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is StoredWatchlistItem =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as { marketId?: unknown }).marketId === "string" &&
            typeof (item as { propositionId?: unknown }).propositionId === "string" &&
            typeof (item as { savedAt?: unknown }).savedAt === "string",
        ),
    )
    .sort(
      (left, right) =>
        Date.parse(right.savedAt) - Date.parse(left.savedAt),
    );
}

@Injectable()
export class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly markets: MarketRepository,
    private readonly propositions: PropositionRepository,
  ) {}

  async getWatchlistForUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentWatchlistViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );
    const storedItems = parseStoredItems(record?.valueJson ?? null);
    const items: RespondentWatchlistItemViewModel[] = [];

    for (const storedItem of storedItems) {
      const proposition = await this.propositions.findById(storedItem.propositionId);
      if (!proposition) {
        continue;
      }

      items.push({
        marketId: storedItem.marketId,
        propositionId: storedItem.propositionId,
        propositionTitle: proposition.title,
        category: proposition.category,
        savedAt: storedItem.savedAt,
      });
    }

    return {
      totalCount: items.length,
      items,
    };
  }

  async saveWatchlistItemForUser(
    userId: string,
    input: UpdateRespondentWatchlistInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UpdateRespondentWatchlistResultViewModel> {
    const market = await this.markets.findById(input.marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${input.marketId} was not found`,
      );
    }

    const proposition = await this.propositions.findById(market.propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${market.propositionId} was not found`,
      );
    }

    const key = this.buildStorageKey(userId);
    const record = await this.systemKeyValues.findByKey(key, db);
    const savedAt = new Date().toISOString();
    const currentItems = parseStoredItems(record?.valueJson ?? null).filter(
      (item) => item.marketId !== input.marketId,
    );
    const nextItems = [
      {
        marketId: input.marketId,
        propositionId: market.propositionId,
        savedAt,
      },
      ...currentItems,
    ];

    await this.persistItems(userId, nextItems, db);

    return {
      marketId: input.marketId,
      propositionId: market.propositionId,
      isSaved: true,
      savedAt,
    };
  }

  async removeWatchlistItemForUser(
    userId: string,
    marketId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<UpdateRespondentWatchlistResultViewModel> {
    const market = await this.markets.findById(marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${marketId} was not found`,
      );
    }

    const key = this.buildStorageKey(userId);
    const record = await this.systemKeyValues.findByKey(key, db);
    const currentItems = parseStoredItems(record?.valueJson ?? null);
    const nextItems = currentItems.filter((item) => item.marketId !== marketId);

    await this.persistItems(userId, nextItems, db);

    return {
      marketId,
      propositionId: market.propositionId,
      isSaved: false,
      savedAt: null,
    };
  }

  private async persistItems(
    userId: string,
    items: StoredWatchlistItem[],
    db: ArenaDbClient,
  ) {
    const key = this.buildStorageKey(userId);

    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena watchlist for ${userId}`,
        valueJson: cloneItems(items) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena watchlist for ${userId}`,
        valueJson: cloneItems(items) as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private buildStorageKey(userId: string): string {
    return `${WATCHLIST_NAMESPACE}.${userId}`;
  }
}
