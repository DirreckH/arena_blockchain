import { Injectable } from "@nestjs/common";
import type { Prisma, RewardLedger } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class RewardLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: {
      propositionId?: string;
      userId?: string;
      responseId?: string;
      status?: RewardLedger["status"];
      sourceType?: RewardLedger["sourceType"];
    } = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger[]> {
    return db.rewardLedger.findMany({
      where: {
        propositionId: filters.propositionId,
        userId: filters.userId,
        responseId: filters.responseId,
        status: filters.status,
        sourceType: filters.sourceType,
      },
      orderBy: [
        { createdAt: "desc" },
        { ledgerVersion: "desc" },
      ],
    });
  }

  async create(
    data: Prisma.RewardLedgerUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger> {
    return db.rewardLedger.create({ data });
  }

  async findById(
    ledgerId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger | null> {
    return db.rewardLedger.findUnique({ where: { id: ledgerId } });
  }

  async findByResponseId(
    responseId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger[]> {
    return db.rewardLedger.findMany({
      where: { responseId },
      orderBy: [{ ledgerVersion: "asc" }, { createdAt: "asc" }],
    });
  }

  async findLatestByResponseId(
    responseId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger | null> {
    return db.rewardLedger.findFirst({
      where: { responseId },
      orderBy: [{ ledgerVersion: "desc" }, { createdAt: "desc" }],
    });
  }

  async findByPropositionAndUser(
    propositionId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger | null> {
    return db.rewardLedger.findFirst({
      where: {
        propositionId,
        userId,
        sourceType: "response",
      },
      orderBy: [{ ledgerVersion: "desc" }, { createdAt: "desc" }],
    });
  }

  async listByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger[]> {
    return db.rewardLedger.findMany({
      where: { userId },
      orderBy: [
        { createdAt: "desc" },
        { ledgerVersion: "desc" },
      ],
    });
  }

  async update(
    ledgerId: string,
    data: Prisma.RewardLedgerUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RewardLedger> {
    return db.rewardLedger.update({
      where: { id: ledgerId },
      data,
    });
  }
}
