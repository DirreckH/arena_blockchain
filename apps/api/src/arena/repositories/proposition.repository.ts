import { Injectable } from "@nestjs/common";
import type { Prisma, Proposition, PropositionStatus } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class PropositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: {
      status?: PropositionStatus;
      category?: Proposition["category"];
      marketEnabled?: boolean;
      createdFrom?: Date;
      createdTo?: Date;
    } = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition[]> {
    return db.proposition.findMany({
      where: {
        status: filters.status,
        category: filters.category,
        marketEnabled: filters.marketEnabled,
        createdAt:
          filters.createdFrom || filters.createdTo
            ? {
                gte: filters.createdFrom,
                lte: filters.createdTo,
              }
            : undefined,
      },
      orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
    });
  }

  async findById(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition | null> {
    return db.proposition.findUnique({ where: { id: propositionId } });
  }

  async getLiveById(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition | null> {
    return db.proposition.findFirst({
      where: { id: propositionId, status: "live" },
    });
  }

  async listByIds(
    propositionIds: string[],
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition[]> {
    if (propositionIds.length === 0) {
      return [];
    }

    return db.proposition.findMany({
      where: {
        id: { in: propositionIds },
      },
    });
  }

  async create(
    data: Prisma.PropositionUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition> {
    return db.proposition.create({ data });
  }

  async update(
    propositionId: string,
    data: Prisma.PropositionUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition> {
    return db.proposition.update({
      where: { id: propositionId },
      data,
    });
  }

  async updateStatus(
    propositionId: string,
    status: PropositionStatus,
    data: Omit<Prisma.PropositionUncheckedUpdateInput, "status"> = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<Proposition> {
    return this.update(
      propositionId,
      {
        ...data,
        status,
      },
      db,
    );
  }
}
