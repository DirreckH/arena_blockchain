import { Injectable } from "@nestjs/common";
import type { Prisma, ResponseReview } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class ResponseReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.ResponseReviewUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview> {
    return db.responseReview.create({ data });
  }

  async findByResponseId(
    responseId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview | null> {
    return db.responseReview.findUnique({
      where: { responseId },
    });
  }

  async update(
    responseId: string,
    data: Prisma.ResponseReviewUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview> {
    return db.responseReview.update({
      where: { responseId },
      data,
    });
  }

  async listByPropositionId(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview[]> {
    return db.responseReview.findMany({
      where: {
        response: { propositionId },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listPendingByPropositionId(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview[]> {
    return db.responseReview.findMany({
      where: {
        status: "pending_review",
        response: { propositionId },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listFinalizedByPropositionId(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview[]> {
    return db.responseReview.findMany({
      where: {
        response: { propositionId },
        status: {
          in: ["valid", "partial_valid", "invalid", "fraud_suspected"],
        },
      },
    });
  }

  async listFinalizedByUserId(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ResponseReview[]> {
    return db.responseReview.findMany({
      where: {
        response: { userId },
        status: {
          in: ["valid", "partial_valid", "invalid", "fraud_suspected"],
        },
      },
      orderBy: { reviewedAt: "desc" },
    });
  }
}
