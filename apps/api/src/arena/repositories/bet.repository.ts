import { Injectable } from "@nestjs/common";
import type { Bet, Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

type UnsyncedProjectedBetBacklogRecord = Prisma.BetGetPayload<{
  include: {
    market: {
      select: {
        chainMarketId: true;
        chainStatus: true;
      };
    };
  };
}>;

@Injectable()
export class BetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.BetUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet> {
    return db.bet.create({ data });
  }

  async findById(
    betId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet | null> {
    return db.bet.findUnique({ where: { id: betId } });
  }

  async findByMarketAndUser(
    marketId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet | null> {
    return db.bet.findUnique({
      where: {
        marketId_userId: {
          marketId,
          userId,
        },
      },
    });
  }

  async listByMarketId(
    marketId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet[]> {
    return db.bet.findMany({
      where: { marketId },
      orderBy: { placedAt: "asc" },
    });
  }

  async listByUserId(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet[]> {
    return db.bet.findMany({
      where: { userId },
      orderBy: [{ settledAt: "desc" }, { placedAt: "desc" }],
    });
  }

  async listUnsyncedProjectedBacklog(
    limit: number,
    db: ArenaDbClient = this.prisma,
  ): Promise<UnsyncedProjectedBetBacklogRecord[]> {
    return db.bet.findMany({
      where: {
        chainSyncedAt: null,
        market: {
          chainMarketId: {
            not: null,
          },
          chainStatus: {
            notIn: ["resolved", "cancelled"],
          },
        },
      },
      include: {
        market: {
          select: {
            chainMarketId: true,
            chainStatus: true,
          },
        },
      },
      orderBy: {
        placedAt: "asc",
      },
      take: limit,
    });
  }

  async update(
    betId: string,
    data: Prisma.BetUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Bet> {
    return db.bet.update({
      where: { id: betId },
      data,
    });
  }
}
