import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";

import {
  ArenaDomainError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ValidationChainBetReconciliationBatchItemViewModel,
  ValidationChainBetReconciliationBatchItemStatus,
  ValidationChainBetReconciliationBatchViewModel,
  ValidationChainBetReconciliationViewModel,
} from "../internal-ops.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { ValidationChainContractService } from "./validation-chain-contract.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const DEFAULT_BATCH_LIMIT = 20;

@Injectable()
export class ValidationChainBetReconciliationService {
  constructor(
    private readonly bets: BetRepository,
    private readonly markets: MarketRepository,
    private readonly contract: ValidationChainContractService,
    private readonly audit: InternalAuditService,
  ) {}

  async reconcileBet(input: {
    marketId: string;
    userId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<ValidationChainBetReconciliationViewModel> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.reconcile.actor_required",
        "Validation-chain bet reconciliation requires an explicit actor",
      );
    }

    const market = await this.markets.findById(input.marketId);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${input.marketId} was not found`,
      );
    }

    if (!market.chainMarketId) {
      throw new ArenaValidationError(
        "validation_chain.reconcile.market_not_projected",
        "Validation-chain bet reconciliation requires a projected chain market id",
      );
    }

    const normalizedUserId = normalizeWalletAddress(input.userId);
    const bet = await this.bets.findByMarketAndUser(input.marketId, normalizedUserId);
    if (!bet) {
      throw new ArenaNotFoundError(
        "bet.not_found",
        `Bet for market ${input.marketId} and user ${normalizedUserId} was not found`,
      );
    }

    const [position, claimableAmount] = await Promise.all([
      this.contract.getUserPosition(market.chainMarketId, normalizedUserId),
      this.contract.claimableAmount(market.chainMarketId, normalizedUserId),
    ]);

    const normalizedPosition = normalizeContractPosition(position);
    const claimableAmountString = claimableAmount.toString();
    const positionExists = BigInt(normalizedPosition.stakeAmount) > 0n;
    const optionMatches =
      positionExists && normalizedPosition.selectedOption === bet.selectedOption;
    const amountMatches =
      positionExists && normalizedPosition.stakeAmount === bet.stakeAmount;
    const claimedMatches = normalizedPosition.claimed === bet.claimed;

    const result: ValidationChainBetReconciliationViewModel = {
      betId: bet.id,
      marketId: bet.marketId,
      propositionId: bet.propositionId,
      userId: normalizedUserId,
      localBet: {
        selectedOption: bet.selectedOption,
        stakeAmount: bet.stakeAmount,
        status: bet.status,
        claimed: bet.claimed,
        chainSyncedAt: toIso(bet.chainSyncedAt),
        placedAt: bet.placedAt.toISOString(),
      },
      onChainPosition: {
        exists: positionExists,
        selectedOption: positionExists ? normalizedPosition.selectedOption : null,
        stakeAmount: normalizedPosition.stakeAmount,
        claimed: normalizedPosition.claimed,
        claimableAmount: claimableAmountString,
      },
      comparison: {
        positionExists,
        optionMatches,
        amountMatches,
        claimedMatches,
        claimableAmount: claimableAmountString,
      },
    };

    await this.audit.record({
      entityType: "validation_chain_market",
      entityId: market.chainMarketId,
      action: "validation_chain.bet_reconciliation.performed",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      metadata: {
        betId: bet.id,
        marketId: bet.marketId,
        propositionId: bet.propositionId,
        userId: normalizedUserId,
        positionExists,
        optionMatches,
        amountMatches,
        claimedMatches,
        claimableAmount: claimableAmountString,
      },
    });

    return result;
  }

  async reconcileUnsyncedBets(input: {
    actorUserId?: string | null;
    reason: string;
    note?: string;
    limit?: number;
  }): Promise<ValidationChainBetReconciliationBatchViewModel> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.reconcile.actor_required",
        "Validation-chain batch reconciliation requires an explicit actor",
      );
    }

    const requestedLimit = clampBatchLimit(input.limit);
    const backlog = await this.bets.listUnsyncedProjectedBacklog(requestedLimit);
    const items: ValidationChainBetReconciliationBatchItemViewModel[] =
      await Promise.all(
      backlog.map(async (bet) => {
        try {
          const reconciliation = await this.reconcileBet({
            marketId: bet.marketId,
            userId: bet.userId,
            actorUserId: input.actorUserId,
            reason: input.reason,
            note: input.note,
          });

          return {
            betId: bet.id,
            marketId: bet.marketId,
            propositionId: bet.propositionId,
            userId: bet.userId,
            status: classifyBatchItemStatus(reconciliation),
            reconciliation,
            errorCode: null,
            errorMessage: null,
          } satisfies ValidationChainBetReconciliationBatchItemViewModel;
        } catch (error) {
          const domainError =
            error instanceof ArenaDomainError
              ? error
              : new ArenaValidationError(
                  "validation_chain.reconcile.unexpected_error",
                  error instanceof Error
                    ? error.message
                    : "Validation-chain batch reconciliation failed",
                );

          return {
            betId: bet.id,
            marketId: bet.marketId,
            propositionId: bet.propositionId,
            userId: bet.userId,
            status: "failed" as ValidationChainBetReconciliationBatchItemStatus,
            reconciliation: null,
            errorCode: domainError.code,
            errorMessage: domainError.message,
          } satisfies ValidationChainBetReconciliationBatchItemViewModel;
        }
      }),
    );

    const matchedCount = items.filter((item) => item.status === "matched").length;
    const mismatchedCount = items.filter(
      (item) => item.status === "mismatched",
    ).length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const processedAt = new Date().toISOString();

    await this.audit.record({
      entityType: "validation_chain_stream",
      entityId: "validation_chain_unsynced_bet_backlog",
      action: "validation_chain.bet_reconciliation.batch.performed",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      metadata: {
        requestedLimit,
        processedCount: items.length,
        matchedCount,
        mismatchedCount,
        failedCount,
        propositionIds: Array.from(
          new Set(items.map((item) => item.propositionId)),
        ),
        marketIds: Array.from(new Set(items.map((item) => item.marketId))),
        betIds: items.map((item) => item.betId),
      },
    });

    return {
      processedAt,
      requestedLimit,
      processedCount: items.length,
      matchedCount,
      mismatchedCount,
      failedCount,
      items,
    };
  }
}

function normalizeWalletAddress(userId: string): string {
  return ethers.utils.getAddress(userId).toLowerCase();
}

function classifyBatchItemStatus(
  reconciliation: ValidationChainBetReconciliationViewModel,
): ValidationChainBetReconciliationBatchItemStatus {
  return reconciliation.comparison.positionExists &&
    reconciliation.comparison.optionMatches &&
    reconciliation.comparison.amountMatches &&
    reconciliation.comparison.claimedMatches
    ? "matched"
    : "mismatched";
}

function clampBatchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_BATCH_LIMIT;
  }

  return Math.min(100, Math.max(1, Math.trunc(limit ?? DEFAULT_BATCH_LIMIT)));
}

function normalizeContractPosition(position: unknown): {
  selectedOption: number;
  stakeAmount: string;
  claimed: boolean;
} {
  if (!position || typeof position !== "object") {
    throw new ArenaValidationError(
      "validation_chain.reconcile.invalid_position_payload",
      "Validation-chain position payload is invalid",
    );
  }

  const candidate = position as {
    selectedOption?: unknown;
    stakeAmount?: { toString(): string } | string;
    claimed?: unknown;
  };

  return {
    selectedOption: Number(candidate.selectedOption ?? 0),
    stakeAmount:
      typeof candidate.stakeAmount === "string"
        ? candidate.stakeAmount
        : candidate.stakeAmount?.toString() ?? "0",
    claimed: Boolean(candidate.claimed),
  };
}
