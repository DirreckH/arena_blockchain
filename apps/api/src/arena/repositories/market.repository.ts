import { Injectable } from "@nestjs/common";
import type { Market, MarketStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class MarketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    marketId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market | null> {
    return db.market.findUnique({ where: { id: marketId } });
  }

  async findByPropositionId(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market | null> {
    return db.market.findUnique({ where: { propositionId } });
  }

  async findByChainMarketId(
    chainMarketId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market | null> {
    return db.market.findUnique({ where: { chainMarketId } });
  }

  async findByChainPropositionId(
    chainPropositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market | null> {
    return db.market.findFirst({
      where: { chainPropositionId },
      orderBy: { createdAt: "asc" },
    });
  }

  async list(
    db: ArenaDbClient = this.prisma,
  ): Promise<Market[]> {
    return db.market.findMany({
      orderBy: [
        { liveAt: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  async create(
    data: Prisma.MarketUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market> {
    return db.market.create({ data });
  }

  async update(
    marketId: string,
    data: Prisma.MarketUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market> {
    return db.market.update({
      where: { id: marketId },
      data,
    });
  }

  async updateStatus(
    marketId: string,
    status: MarketStatus,
    data: Omit<Prisma.MarketUncheckedUpdateInput, "status"> = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<Market> {
    return this.update(
      marketId,
      {
        ...data,
        status,
      },
      db,
    );
  }

  async updatePublicProgress(
    marketId: string,
    currentPublicProgress: Prisma.InputJsonValue,
    db: ArenaDbClient = this.prisma,
  ): Promise<Market> {
    return this.update(
      marketId,
      {
        currentPublicProgress,
      },
      db,
    );
  }
}
