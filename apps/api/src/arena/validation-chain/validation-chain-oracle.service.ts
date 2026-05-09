import { Injectable } from "@nestjs/common";
import type { Market, Proposition } from "@prisma/client";
import type { providers } from "ethers";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import { withArenaTransaction } from "../arena-transaction.utils";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import type { ValidationChainCommandResult } from "./validation-chain.types";
import {
  VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
  ValidationChainContractError,
  ValidationContractResultKind,
  ValidationContractVoidReason,
} from "./validation-chain.types";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";

interface ValidationChainResolveInput {
  propositionId: string;
  actorUserId?: string | null;
  reason?: string;
  note?: string;
}

interface PreparedResolveContext {
  proposition: Proposition;
  market: Market;
  chainPropositionId: string;
  chainMarketId: string;
}

@Injectable()
export class ValidationChainOracleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly ids: ValidationChainIdService,
    private readonly contract: ValidationChainContractService,
    private readonly audit: InternalAuditService,
  ) {}

  async resolveMarket(
    input: ValidationChainResolveInput,
  ): Promise<ValidationChainCommandResult> {
    const prepared = await this.prepareContext(input.propositionId);
    this.assertOfficialResult(prepared.proposition);

    const onChainMarket = await this.contract.getMarketOrNull(prepared.chainMarketId);
    if (!onChainMarket) {
      throw new ArenaConflictError(
        "validation_chain.resolve.market_not_created",
        "Validation market does not exist on-chain yet",
      );
    }

    if (onChainMarket.state === 4) {
      throw new ArenaConflictError(
        "validation_chain.resolve.already_resolved",
        "Validation market is already resolved on-chain",
      );
    }

    if (onChainMarket.state === 5) {
      throw new ArenaConflictError(
        "validation_chain.resolve.cancelled",
        "Cancelled validation markets cannot be resolved",
      );
    }

    if (onChainMarket.state !== 3) {
      throw new ArenaConflictError(
        "validation_chain.resolve.invalid_state",
        "Validation market can only be resolved from Frozen state",
      );
    }

    const payload = this.buildPayload(prepared);
    const attemptedAt = new Date();

    try {
      const tx = await this.contract.sendResolveMarket(payload);
      await this.recordAudit({
        action: "validation_chain.resolve_market.submitted",
        prepared,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          txHash: tx.hash,
          retryable: false,
          payload,
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });

      return {
        propositionId: prepared.proposition.id,
        marketId: prepared.market.id,
        chainPropositionId: prepared.chainPropositionId,
        chainMarketId: prepared.chainMarketId,
        txHash: tx.hash,
        attemptedAt: attemptedAt.toISOString(),
        retryable: false,
      };
    } catch (error) {
      const retryable = isRetryableResolveError(error);
      await this.recordAudit({
        action: "validation_chain.resolve_market.failed",
        prepared,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          retryable,
          payload,
          error: error instanceof Error ? error.message : String(error),
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });
      throw error;
    }
  }

  private async prepareContext(
    propositionId: string,
  ): Promise<PreparedResolveContext> {
    return withArenaTransaction(this.prisma, undefined, async (tx) => {
      const proposition = await this.propositions.findById(propositionId, tx);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${propositionId} was not found`,
        );
      }

      const market = await this.markets.findByPropositionId(propositionId, tx);
      if (!market) {
        throw new ArenaNotFoundError(
          "market.not_found",
          `Market for proposition ${propositionId} was not found`,
        );
      }

      const chainPropositionId = this.ids.buildChainPropositionId(proposition.id);
      const chainMarketId = this.ids.buildChainMarketId(market.id);

      await this.markets.update(
        market.id,
        {
          chainPropositionId,
          chainMarketId,
        },
        tx,
      );

      return {
        proposition,
        market: {
          ...market,
          chainPropositionId,
          chainMarketId,
        },
        chainPropositionId,
        chainMarketId,
      };
    });
  }

  private assertOfficialResult(proposition: Proposition): void {
    if (!proposition.resultKind || !proposition.resultComputedAt) {
      throw new ArenaValidationError(
        "validation_chain.resolve.result_missing",
        "Validation resolve requires an official adjudication result",
      );
    }

    if (proposition.resultKind === "resolved" && proposition.winningOption === null) {
      throw new ArenaValidationError(
        "validation_chain.resolve.winning_option_missing",
        "Resolved validation markets require a winning option",
      );
    }

    if (proposition.resultKind === "void" && proposition.voidReason === null) {
      throw new ArenaValidationError(
        "validation_chain.resolve.void_reason_missing",
        "Void validation markets require a void reason",
      );
    }
  }

  private buildPayload(prepared: PreparedResolveContext) {
    if (prepared.proposition.resultKind === "resolved") {
      return {
        marketId: prepared.chainMarketId,
        propositionId: prepared.chainPropositionId,
        resultKind: ValidationContractResultKind.Resolved,
        winningOption: prepared.proposition.winningOption as number,
        voidReason: ValidationContractVoidReason.None,
      };
    }

    return {
      marketId: prepared.chainMarketId,
      propositionId: prepared.chainPropositionId,
      resultKind: ValidationContractResultKind.Void,
      winningOption: 2,
      voidReason:
        prepared.proposition.voidReason === "insufficient_sample"
          ? ValidationContractVoidReason.InsufficientSample
          : ValidationContractVoidReason.Tie,
    };
  }

  private async recordAudit(input: {
    action: string;
    prepared: PreparedResolveContext;
    actorUserId?: string | null;
    reason?: string;
    note?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_market",
      entityId: input.prepared.market.id,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason ?? VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
      note: input.note,
      metadata: {
        propositionId: input.prepared.proposition.id,
        marketId: input.prepared.market.id,
        chainPropositionId: input.prepared.chainPropositionId,
        chainMarketId: input.prepared.chainMarketId,
        resultKind: input.prepared.proposition.resultKind,
        winningOption: input.prepared.proposition.winningOption,
        voidReason: input.prepared.proposition.voidReason,
        resultComputedAt: input.prepared.proposition.resultComputedAt?.toISOString(),
        ...input.metadata,
      },
    });
  }
}

function isRetryableResolveError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof ArenaConflictError || error instanceof ArenaValidationError) {
    return false;
  }

  if (error instanceof ValidationChainContractError) {
    return /timeout|network|replacement|nonce|underpriced|server error|ECONN/i.test(
      error.message,
    );
  }

  return false;
}
