import { Injectable } from "@nestjs/common";
import { ethers, type providers } from "ethers";
import type { Market, Proposition } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import type {
  ValidationChainCommandResult,
  ValidationContractMarketState,
} from "./validation-chain.types";
import {
  VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
  ValidationChainContractError,
} from "./validation-chain.types";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";

interface ValidationChainCommandInput {
  propositionId: string;
  actorUserId?: string | null;
  reason?: string;
  note?: string;
}

interface ValidationChainCancelMarketInput extends ValidationChainCommandInput {
  reasonCode: string;
}

interface PreparedValidationMarketContext {
  proposition: Proposition;
  market: Market;
  chainPropositionId: string;
  chainMarketId: string;
}

@Injectable()
export class ValidationChainOperatorCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly ids: ValidationChainIdService,
    private readonly contract: ValidationChainContractService,
    private readonly audit: InternalAuditService,
  ) {}

  async createMarket(
    input: ValidationChainCommandInput,
  ): Promise<ValidationChainCommandResult> {
    const prepared = await this.prepareContext(input.propositionId);

    if (prepared.market.chainStatus !== null) {
      throw new ArenaConflictError(
        "validation_chain.create.already_projected",
        "Validation market is already projected on-chain",
      );
    }

    const onChainMarket = await this.contract.getMarketOrNull(prepared.chainMarketId);
    if (onChainMarket !== null) {
      throw new ArenaConflictError(
        "validation_chain.create.already_exists",
        "Validation market already exists on-chain",
      );
    }

    return this.executeCommand({
      action: "validation_chain.create_market",
      prepared,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      send: async () =>
        this.contract.sendCreateMarket(
          prepared.chainMarketId,
          prepared.chainPropositionId,
          prepared.proposition.minBetAmount,
        ),
    });
  }

  async openMarket(
    input: ValidationChainCommandInput,
  ): Promise<ValidationChainCommandResult> {
    const prepared = await this.prepareContext(input.propositionId);
    if (prepared.market.status !== "live") {
      throw new ArenaValidationError(
        "validation_chain.open.market_not_live",
        "Validation market can only be opened after the local market is live",
      );
    }

    const onChainMarket = await this.requireOnChainMarket(prepared.chainMarketId);
    this.assertOnChainState(
      "open",
      onChainMarket.state,
      1,
    );

    return this.executeCommand({
      action: "validation_chain.open_market",
      prepared,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      send: async () => this.contract.sendOpenMarket(prepared.chainMarketId),
    });
  }

  async freezeMarket(
    input: ValidationChainCommandInput,
  ): Promise<ValidationChainCommandResult> {
    const prepared = await this.prepareContext(input.propositionId);
    if (prepared.market.status !== "frozen_for_reveal") {
      throw new ArenaValidationError(
        "validation_chain.freeze.market_not_ready",
        "Validation market can only be frozen after the local market is frozen_for_reveal",
      );
    }

    const onChainMarket = await this.requireOnChainMarket(prepared.chainMarketId);
    this.assertOnChainState(
      "freeze",
      onChainMarket.state,
      2,
    );

    return this.executeCommand({
      action: "validation_chain.freeze_market",
      prepared,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      send: async () => this.contract.sendFreezeMarket(prepared.chainMarketId),
    });
  }

  async cancelMarket(
    input: ValidationChainCancelMarketInput,
  ): Promise<ValidationChainCommandResult> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.cancel.actor_required",
        "Validation market cancellation requires an explicit actor",
      );
    }

    const prepared = await this.prepareContext(input.propositionId);
    const onChainMarket = await this.requireOnChainMarket(prepared.chainMarketId);
    if (![1, 2, 3].includes(onChainMarket.state)) {
      throw new ArenaConflictError(
        "validation_chain.cancel.invalid_state",
        "Validation market cannot be cancelled from the current on-chain state",
      );
    }

    return this.executeCommand({
      action: "validation_chain.cancel_market",
      prepared,
      actorUserId: input.actorUserId,
      reason: input.reason ?? "validation_chain.cancel.manual",
      note: input.note,
      send: async () =>
        this.contract.sendCancelMarket(
          prepared.chainMarketId,
          this.toBytes32ReasonCode(input.reasonCode),
        ),
    });
  }

  private async prepareContext(
    propositionId: string,
  ): Promise<PreparedValidationMarketContext> {
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

  private async requireOnChainMarket(chainMarketId: string) {
    const market = await this.contract.getMarketOrNull(chainMarketId);
    if (!market) {
      throw new ArenaConflictError(
        "validation_chain.market_not_created",
        "Validation market does not exist on-chain yet",
      );
    }

    return market;
  }

  private assertOnChainState(
    action: string,
    actual: ValidationContractMarketState,
    expected: number,
  ): void {
    if (actual !== expected) {
      throw new ArenaConflictError(
        `validation_chain.${action}.invalid_state`,
        `Validation market cannot ${action} from the current on-chain state`,
      );
    }
  }

  private async executeCommand(input: {
    action: string;
    prepared: PreparedValidationMarketContext;
    actorUserId?: string | null;
    reason?: string;
    note?: string;
    send: () => Promise<providers.TransactionResponse>;
  }): Promise<ValidationChainCommandResult> {
    const attemptedAt = new Date();
    try {
      const tx = await input.send();
      await this.recordAudit({
        action: `${input.action}.submitted`,
        prepared: input.prepared,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          txHash: tx.hash,
          retryable: false,
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });

      return {
        propositionId: input.prepared.proposition.id,
        marketId: input.prepared.market.id,
        chainPropositionId: input.prepared.chainPropositionId,
        chainMarketId: input.prepared.chainMarketId,
        txHash: tx.hash,
        attemptedAt: attemptedAt.toISOString(),
        retryable: false,
      };
    } catch (error) {
      const retryable = isRetryableCommandError(error);
      await this.recordAudit({
        action: `${input.action}.failed`,
        prepared: input.prepared,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          retryable,
          error: error instanceof Error ? error.message : String(error),
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });
      throw error;
    }
  }

  private async recordAudit(input: {
    action: string;
    prepared: PreparedValidationMarketContext;
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
        ...input.metadata,
      },
    });
  }

  private toBytes32ReasonCode(reasonCode: string): string {
    if (ethers.utils.isHexString(reasonCode, 32)) {
      return reasonCode;
    }

    return ethers.utils.formatBytes32String(reasonCode);
  }
}

function isRetryableCommandError(error: unknown): boolean {
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
