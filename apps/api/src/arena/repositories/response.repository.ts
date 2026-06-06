import { Injectable } from "@nestjs/common";
import type { Prisma, Response } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class ResponseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(
    data: Prisma.ResponseUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response> {
    return db.response.create({ data });
  }

  async findById(
    responseId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response | null> {
    return db.response.findUnique({ where: { id: responseId } });
  }

  async findLatestByTaskId(
    taskId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response | null> {
    return db.response.findFirst({
      where: { taskId, isLatest: true },
      orderBy: { responseVersion: "desc" },
    });
  }

  async findLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response | null> {
    return db.response.findFirst({
      where: { propositionId, userId, isLatest: true },
      orderBy: { responseVersion: "desc" },
    });
  }

  async clearLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<void> {
    await db.response.updateMany({
      where: { propositionId, userId, isLatest: true },
      data: { isLatest: false },
    });
  }

  async listByTaskId(
    taskId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response[]> {
    return db.response.findMany({
      where: { taskId },
      orderBy: { responseVersion: "asc" },
    });
  }

  async listLatestByProposition(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response[]> {
    return db.response.findMany({
      where: { propositionId, isLatest: true },
    });
  }

  async listLatestByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Response[]> {
    return db.response.findMany({
      where: {
        userId,
        isLatest: true,
      },
      orderBy: { submittedAt: "desc" },
    });
  }

  async listLatest(
    filters: {
      propositionId?: string;
      userId?: string;
      limit?: number;
    } = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<Response[]> {
    return db.response.findMany({
      where: {
        isLatest: true,
        ...(filters.propositionId
          ? { propositionId: filters.propositionId }
          : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: [
        { submittedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: filters.limit,
    });
  }
}
