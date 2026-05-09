import { Injectable } from "@nestjs/common";
import type { RespondentRewardLedgerViewModel } from "@arena/shared";

import { ArenaNotFoundError } from "../arena.errors";
import { PropositionRepository } from "../repositories/proposition.repository";
import { RewardLedgerService } from "./reward-ledger.service";

@Injectable()
export class RewardViewService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly rewards: RewardLedgerService,
  ) {}

  async listRewardsForUser(
    userId: string,
  ): Promise<RespondentRewardLedgerViewModel[]> {
    const ledgers = await this.rewards.listByUser(userId);
    const latestVersionByProposition = new Map<string, number>();

    for (const ledger of ledgers) {
      const current = latestVersionByProposition.get(ledger.propositionId) ?? 0;
      if (ledger.ledgerVersion > current) {
        latestVersionByProposition.set(ledger.propositionId, ledger.ledgerVersion);
      }
    }

    return Promise.all(
      ledgers.map(async (ledger) => {
        const proposition = await this.propositions.findById(ledger.propositionId);
        if (!proposition) {
          throw new ArenaNotFoundError(
            "proposition.not_found",
            `Proposition ${ledger.propositionId} was not found`,
          );
        }

        return {
          ledgerId: ledger.id,
          propositionId: ledger.propositionId,
          propositionTitle: proposition.title,
          responseId: ledger.responseId,
          sourceType: ledger.sourceType,
          status: ledger.status,
          pendingAmount: ledger.pendingAmount,
          finalAmount: ledger.finalAmount,
          reviewStatus: ledger.reviewStatus,
          reasonCode: ledger.reasonCode,
          createdAt: ledger.createdAt,
          finalizedAt: ledger.finalizedAt,
          voidedAt: ledger.voidedAt,
          reversedAt: ledger.reversedAt,
          ledgerVersion: ledger.ledgerVersion,
          isCurrent:
            latestVersionByProposition.get(ledger.propositionId) ===
            ledger.ledgerVersion,
        } satisfies RespondentRewardLedgerViewModel;
      }),
    );
  }
}
