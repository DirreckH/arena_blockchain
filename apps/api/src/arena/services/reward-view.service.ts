import { Injectable } from "@nestjs/common";
import type { RespondentRewardLedgerViewModel } from "@arena/shared";

import { ArenaNotFoundError } from "../arena.errors";
import { PropositionRepository } from "../repositories/proposition.repository";
import { RewardLedgerService } from "./reward-ledger.service";
import { RewardPayoutService } from "./reward-payout.service";

@Injectable()
export class RewardViewService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly rewards: RewardLedgerService,
    private readonly payouts?: RewardPayoutService,
  ) {}

  async listRewardsForUser(
    userId: string,
  ): Promise<RespondentRewardLedgerViewModel[]> {
    const [ledgers, payouts] = await Promise.all([
      this.rewards.listByUser(userId),
      this.payouts?.listByUser(userId) ?? Promise.resolve([]),
    ]);
    const latestVersionByProposition = new Map<string, number>();
    const payoutByLedgerId = new Map(
      payouts.map((payout) => [payout.ledgerId, payout]),
    );
    const propositions = await this.propositions.listByIds(
      [...new Set(ledgers.map((ledger) => ledger.propositionId))],
    );
    const propositionById = new Map(
      propositions.map((proposition) => [proposition.id, proposition]),
    );

    for (const ledger of ledgers) {
      const current = latestVersionByProposition.get(ledger.propositionId) ?? 0;
      if (ledger.ledgerVersion > current) {
        latestVersionByProposition.set(ledger.propositionId, ledger.ledgerVersion);
      }
    }

    return Promise.all(
      ledgers.map(async (ledger) => {
        const proposition = propositionById.get(ledger.propositionId);
        if (!proposition) {
          throw new ArenaNotFoundError(
            "proposition.not_found",
            `Proposition ${ledger.propositionId} was not found`,
          );
        }
        const payout = payoutByLedgerId.get(ledger.id) ?? null;

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
          payoutStatus: payout?.status ?? null,
          payoutMethod: payout?.method ?? null,
          payoutAmount: payout?.amount ?? null,
          payoutAssetSymbol: payout?.assetSymbol ?? null,
          payoutDestinationAddress: payout?.destinationAddress ?? null,
          payoutRequestedAt: payout?.requestedAt.toISOString() ?? null,
          payoutCompletedAt: payout?.completedAt?.toISOString() ?? null,
          payoutFailureReason: payout?.lastErrorMessage ?? null,
        } satisfies RespondentRewardLedgerViewModel;
      }),
    );
  }
}
