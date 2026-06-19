import { Injectable } from "@nestjs/common";
import type { Prisma, RewardPayout } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class RewardPayoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.RewardPayoutUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout> {
    return db.rewardPayout.create({ data });
  }

  async findById(
    payoutId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout | null> {
    return db.rewardPayout.findUnique({ where: { id: payoutId } });
  }

  async findByLedgerId(
    ledgerId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout | null> {
    return db.rewardPayout.findUnique({ where: { ledgerId } });
  }

  async list(
    filters: {
      userId?: string;
      ledgerId?: string;
      status?: RewardPayout["status"];
    } = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout[]> {
    return db.rewardPayout.findMany({
      where: {
        userId: filters.userId,
        ledgerId: filters.ledgerId,
        status: filters.status,
      },
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async listByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout[]> {
    return this.list({ userId }, db);
  }

  async update(
    payoutId: string,
    data: Prisma.RewardPayoutUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardPayout> {
    return db.rewardPayout.update({
      where: { id: payoutId },
      data,
    });
  }
}
