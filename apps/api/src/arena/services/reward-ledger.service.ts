import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RewardLedger as SharedRewardLedger } from "@arena/shared";
import { RewardEngine, type RewardReviewResolutionInput } from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import type {
  CreatePendingRewardInput,
  ResolveRewardFromReviewInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import { toDate } from "../arena.utils";
import { toSharedProposition, toSharedResponse, toSharedRewardLedger } from "../arena-view.mapper";
import type { ArenaDbClient } from "../prisma.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";

const toNullableDate = (value: string | null): Date | null =>
  value ? toDate(value) : null;

const toRewardCreateInput = (
  ledger: SharedRewardLedger,
): Prisma.RewardLedgerUncheckedCreateInput => ({
  id: ledger.id,
  propositionId: ledger.propositionId,
  responseId: ledger.responseId,
  userId: ledger.userId,
  sourceType: ledger.sourceType,
  sourceId: ledger.sourceId,
  ledgerVersion: ledger.ledgerVersion,
  pendingAmount: ledger.pendingAmount,
  finalAmount: ledger.finalAmount,
  status: ledger.status,
  reviewStatus: ledger.reviewStatus,
  createdAt: toDate(ledger.createdAt),
  finalizedAt: toNullableDate(ledger.finalizedAt),
  voidedAt: toNullableDate(ledger.voidedAt),
  reversedAt: toNullableDate(ledger.reversedAt),
  reversalOfLedgerId: ledger.reversalOfLedgerId,
  reasonCode: ledger.reasonCode,
});

const toRewardUpdateInput = (
  ledger: SharedRewardLedger,
): Prisma.RewardLedgerUncheckedUpdateInput => ({
  propositionId: ledger.propositionId,
  responseId: ledger.responseId,
  userId: ledger.userId,
  sourceType: ledger.sourceType,
  sourceId: ledger.sourceId,
  ledgerVersion: ledger.ledgerVersion,
  pendingAmount: ledger.pendingAmount,
  finalAmount: ledger.finalAmount,
  status: ledger.status,
  reviewStatus: ledger.reviewStatus,
  createdAt: toDate(ledger.createdAt),
  finalizedAt: toNullableDate(ledger.finalizedAt),
  voidedAt: toNullableDate(ledger.voidedAt),
  reversedAt: toNullableDate(ledger.reversedAt),
  reversalOfLedgerId: ledger.reversalOfLedgerId,
  reasonCode: ledger.reasonCode,
});

@Injectable()
export class RewardLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly responses: ResponseRepository,
    private readonly ledgers: RewardLedgerRepository,
  ) {}

  async recordSubmission(
    input: {
      propositionId: string;
      userId: string;
      responseId: string;
      recordedAt: string;
    },
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildEngine(tx).recordSubmission(input),
    );
  }

  async createPendingRewardForResponse(
    input: CreatePendingRewardInput,
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger> {
    return this.recordSubmission(
      {
        propositionId: input.propositionId,
        userId: input.userId,
        responseId: input.responseId,
        recordedAt: String(input.createdAt),
      },
      db,
    );
  }

  async rebindToLatestResponse(
    input: {
      propositionId: string;
      userId: string;
      responseId: string;
      reboundAt: string;
    },
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildEngine(tx).rebindToLatestResponse(input),
    );
  }

  async resolveFromReview(
    input: ResolveRewardFromReviewInput,
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger> {
    const resolution: RewardReviewResolutionInput = {
      propositionId: input.propositionId,
      responseId: input.responseId,
      reviewStatus: input.reviewStatus,
      isLatest: input.isLatest,
      resolvedAt: String(input.resolvedAt),
      reasonCodes: [...(input.reasonCodes ?? [])],
    };

    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildEngine(tx).resolveFromReview(resolution),
    );
  }

  async getByPropositionAndUser(
    propositionId: string,
    userId: string,
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger | null> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildEngine(tx).getByPropositionAndUser(propositionId, userId),
    );
  }

  async listByUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<SharedRewardLedger[]> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildEngine(tx).listByUser(userId),
    );
  }

  private buildEngine(db: ArenaDbClient): RewardEngine {
    return new RewardEngine({
      ids: {
        next: (namespace) =>
          this.ids.next(namespace === "reward-ledger" ? "reward" : namespace),
      },
      propositionRead: {
        getById: async (propositionId) => {
          const proposition = await this.propositions.findById(propositionId, db);
          return proposition ? toSharedProposition(proposition) : null;
        },
      },
      responses: {
        getById: async (responseId) =>
          toSharedResponse(await this.responses.findById(responseId, db)),
      },
      ledgers: {
        create: async (ledger) =>
          toSharedRewardLedger(
            await this.ledgers.create(toRewardCreateInput(ledger), db),
          )!,
        update: async (ledger) =>
          toSharedRewardLedger(
            await this.ledgers.update(ledger.id, toRewardUpdateInput(ledger), db),
          )!,
        getById: async (ledgerId) =>
          toSharedRewardLedger(await this.ledgers.findById(ledgerId, db)),
        findLatestByPropositionAndUserAndSourceType: async (
          propositionId,
          userId,
        ) =>
          toSharedRewardLedger(
            await this.ledgers.findByPropositionAndUser(propositionId, userId, db),
          ),
        findLatestByResponseId: async (responseId) =>
          toSharedRewardLedger(
            await this.ledgers.findLatestByResponseId(responseId, db),
          ),
        listByResponseId: async (responseId) =>
          (
            await this.ledgers.findByResponseId(responseId, db)
          ).map((ledger) => toSharedRewardLedger(ledger)!),
        listByUser: async (userId) =>
          (await this.ledgers.listByUser(userId, db)).map(
            (ledger) => toSharedRewardLedger(ledger)!,
          ),
      },
    });
  }
}
