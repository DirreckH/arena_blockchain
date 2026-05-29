import { Injectable } from "@nestjs/common";
import type {
  Market,
  MarketStatus,
  Proposition,
  PropositionStatus,
  ValidationChainMarketStatus,
} from "@prisma/client";

import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ValidationChainCommandRecoveryReason,
  ValidationChainCommandRecoveryViewModel,
  ValidationChainContractStateViewModel,
} from "../internal-ops.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { MarketRepository } from "../repositories/market.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import {
  buildValidationLifecycleSnapshot,
  type ValidationLifecycleDriftReason,
} from "../validation-lifecycle";
import { ValidationChainCommandRuntimeService } from "./validation-chain-command-runtime.service";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";
import {
  ValidationContractMarketState,
  type ValidationChainAutomaticCommand,
} from "./validation-chain.types";

interface ValidationChainCommandRecoveryInput {
  propositionId: string;
  actorUserId?: string | null;
  reason: string;
  note?: string;
}

interface ValidationRecoveryPlan {
  recoveryReason: ValidationChainCommandRecoveryReason;
  plannedCommands: ValidationChainAutomaticCommand[];
}

@Injectable()
export class ValidationChainCommandRecoveryService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly ids: ValidationChainIdService,
    private readonly contract: ValidationChainContractService,
    private readonly runtime: ValidationChainCommandRuntimeService,
    private readonly audit: InternalAuditService,
  ) {}

  async recoverQueuedCommands(
    input: ValidationChainCommandRecoveryInput,
  ): Promise<ValidationChainCommandRecoveryViewModel> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.command_recovery.actor_required",
        "Validation-chain command recovery requires an explicit actor",
      );
    }

    const proposition = await this.propositions.findById(input.propositionId);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${input.propositionId} was not found`,
      );
    }

    const market = await this.markets.findByPropositionId(input.propositionId);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market for proposition ${input.propositionId} was not found`,
      );
    }

    const chainMarketId = market.chainMarketId ?? this.ids.buildChainMarketId(market.id);
    const chainPropositionId =
      market.chainPropositionId ?? this.ids.buildChainPropositionId(proposition.id);
    const onChainMarket = await this.contract.getMarketOrNull(chainMarketId);
    const onChainState = this.toContractStateView(onChainMarket?.state ?? null);
    const driftReason = this.resolveDriftReason(proposition, market);
    const plan = this.buildRecoveryPlan({
      proposition,
      market,
      onChainState: onChainMarket?.state ?? null,
    });

    if (
      plan.plannedCommands.includes("create_market") ||
      plan.plannedCommands.includes("open_market")
    ) {
      await this.runtime.enqueueCreateOpenCommands({
        propositionId: proposition.id,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
      });
    }

    if (plan.plannedCommands.includes("freeze_market")) {
      await this.runtime.enqueueFreezeCommand({
        propositionId: proposition.id,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
      });
    }

    if (plan.plannedCommands.includes("resolve_market")) {
      await this.runtime.enqueueResolveCommand({
        propositionId: proposition.id,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
      });
    }

    const queuedAt = new Date().toISOString();
    const result: ValidationChainCommandRecoveryViewModel = {
      propositionId: proposition.id,
      marketId: market.id,
      chainMarketId,
      chainPropositionId,
      queuedAt,
      propositionStatus: proposition.status,
      marketStatus: market.status,
      localChainStatus: market.chainStatus,
      onChainState,
      driftReason,
      recoveryReason: plan.recoveryReason,
      plannedCommands: plan.plannedCommands,
    };

    await this.audit.record({
      entityType: "validation_market",
      entityId: market.id,
      action: "validation_chain.command_recovery.queued",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      metadata: {
        propositionId: result.propositionId,
        marketId: result.marketId,
        chainMarketId: result.chainMarketId,
        chainPropositionId: result.chainPropositionId,
        queuedAt: result.queuedAt,
        propositionStatus: result.propositionStatus,
        marketStatus: result.marketStatus,
        localChainStatus: result.localChainStatus,
        onChainState: result.onChainState,
        driftReason: result.driftReason,
        recoveryReason: result.recoveryReason,
        plannedCommands: [...result.plannedCommands],
      },
    });

    return result;
  }

  private buildRecoveryPlan(input: {
    proposition: Pick<
      Proposition,
      | "id"
      | "status"
      | "resultKind"
      | "resultComputedAt"
      | "marketEnabled"
    >;
    market: Pick<
      Market,
      | "id"
      | "status"
      | "chainMarketId"
      | "chainStatus"
    >;
    onChainState: ValidationContractMarketState | null;
  }): ValidationRecoveryPlan {
    const { proposition, market, onChainState } = input;

    if (!proposition.marketEnabled) {
      throw new ArenaValidationError(
        "validation_chain.command_recovery.market_disabled",
        "Validation-chain command recovery requires a market-enabled proposition",
      );
    }

    if (
      proposition.status === "live" &&
      onChainState === null &&
      (!market.chainMarketId || market.chainStatus === null)
    ) {
      return {
        recoveryReason: "create_open_missing_market",
        plannedCommands: ["create_market", "open_market"],
      };
    }

    if (
      proposition.status === "live" &&
      market.status === "live" &&
      onChainState === ValidationContractMarketState.PreLive
    ) {
      return {
        recoveryReason: "open_pre_live_market",
        plannedCommands: ["open_market"],
      };
    }

    if (
      proposition.status === "frozen" &&
      market.status === "frozen_for_reveal" &&
      onChainState === ValidationContractMarketState.Live
    ) {
      return {
        recoveryReason: "freeze_live_market",
        plannedCommands: ["freeze_market"],
      };
    }

    if (
      proposition.status === "settled" &&
      market.status === "settled" &&
      proposition.resultComputedAt &&
      proposition.resultKind &&
      onChainState === ValidationContractMarketState.Live
    ) {
      return {
        recoveryReason: "freeze_resolve_live_market",
        plannedCommands: ["freeze_market", "resolve_market"],
      };
    }

    if (
      proposition.status === "settled" &&
      market.status === "settled" &&
      proposition.resultComputedAt &&
      proposition.resultKind &&
      onChainState === ValidationContractMarketState.Frozen
    ) {
      return {
        recoveryReason: "resolve_settled_market",
        plannedCommands: ["resolve_market"],
      };
    }

    if (
      proposition.status === "revealing" &&
      market.status === "frozen_for_reveal" &&
      proposition.resultComputedAt &&
      proposition.resultKind &&
      onChainState === ValidationContractMarketState.Live
    ) {
      return {
        recoveryReason: "freeze_resolve_live_market",
        plannedCommands: ["freeze_market", "resolve_market"],
      };
    }

    if (
      proposition.status === "revealing" &&
      market.status === "frozen_for_reveal" &&
      proposition.resultComputedAt &&
      proposition.resultKind &&
      onChainState === ValidationContractMarketState.Frozen
    ) {
      return {
        recoveryReason: "resolve_frozen_market",
        plannedCommands: ["resolve_market"],
      };
    }

    if (
      (proposition.status === "frozen" || proposition.status === "revealing") &&
      market.status === "frozen_for_reveal" &&
      onChainState === ValidationContractMarketState.PreLive
    ) {
      throw new ArenaValidationError(
        "validation_chain.command_recovery.unsafe_pre_live_market",
        "Validation-chain command recovery cannot safely recover a pre-live on-chain market after local freeze",
      );
    }

    throw new ArenaValidationError(
      "validation_chain.command_recovery.no_safe_plan",
      "Validation-chain command recovery cannot safely recover the current local and on-chain state combination",
    );
  }

  private resolveDriftReason(
    proposition: Pick<Proposition, "status" | "marketEnabled">,
    market: Pick<Market, "status" | "chainStatus" | "chainMarketId">,
  ): ValidationLifecycleDriftReason | null {
    return buildValidationLifecycleSnapshot(proposition, market as Market).driftReason;
  }

  private toContractStateView(
    state: ValidationContractMarketState | null,
  ): ValidationChainContractStateViewModel | null {
    switch (state) {
      case null:
        return null;
      case ValidationContractMarketState.Unset:
        return "unset";
      case ValidationContractMarketState.PreLive:
        return "pre_live";
      case ValidationContractMarketState.Live:
        return "live";
      case ValidationContractMarketState.Frozen:
        return "frozen";
      case ValidationContractMarketState.Resolved:
        return "resolved";
      case ValidationContractMarketState.Cancelled:
        return "cancelled";
    }
  }
}
