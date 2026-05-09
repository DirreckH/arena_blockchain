import { Injectable, Optional } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { ArenaValidationError } from "../arena.errors";
import { INTERNAL_AUDIT_ENTITY_TYPES } from "../internal-ops.types";
import { PROPOSITION_AUDIT_ACTIONS } from "../proposition-submission";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ValidationChainCommandRuntimeService } from "../validation-chain/validation-chain-command-runtime.service";
import { FreezeRevealOrchestratorService } from "./freeze-reveal-orchestrator.service";
import { InternalAuditService } from "./internal-audit.service";
import { PropositionEngineService } from "./proposition-engine.service";
import { ValidationSettlementService } from "./validation-settlement.service";

export interface PublishReadyScheduledPropositionsResult {
  processedAt: string;
  processedCount: number;
  propositionIds: string[];
}

export interface FinalizeReadyLivePropositionsResult {
  processedAt: string;
  processedCount: number;
  propositionIds: string[];
}

export interface SettleReadyRevealingPropositionsResult {
  processedAt: string;
  processedCount: number;
  propositionIds: string[];
}

export interface RunDuePropositionTransitionsResult {
  processedAt: string;
  published: PublishReadyScheduledPropositionsResult;
  revealPrepared: FinalizeReadyLivePropositionsResult;
  settled: SettleReadyRevealingPropositionsResult;
}

const DEFAULT_AUTOMATION_ACTOR_USER_ID = "system_scheduler";
const DEFAULT_PLATFORM_FEE_BPS = 0;

@Injectable()
export class PropositionLifecycleAutomationService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly propositionEngine: PropositionEngineService,
    private readonly freezeReveal: FreezeRevealOrchestratorService,
    private readonly validationSettlement: ValidationSettlementService,
    private readonly audits: InternalAuditService,
    private readonly logger: PinoLogger,
    @Optional()
    private readonly validationChainRuntime?: ValidationChainCommandRuntimeService,
  ) {
    this.logger.setContext(PropositionLifecycleAutomationService.name);
  }

  async publishReadyScheduledPropositions(input: {
    now?: string;
    actorUserId?: string;
    limit?: number;
  } = {}): Promise<PublishReadyScheduledPropositionsResult> {
    const now = input.now ?? new Date().toISOString();
    const actorUserId = input.actorUserId ?? DEFAULT_AUTOMATION_ACTOR_USER_ID;
    const propositions = await this.propositions.list({ status: "scheduled" });

    const ready = propositions
      .filter(
        (proposition) =>
          proposition.publishedAt !== null &&
          proposition.publishedAt.getTime() <= Date.parse(now),
      )
      .sort(
        (left, right) =>
          (left.publishedAt?.getTime() ?? 0) - (right.publishedAt?.getTime() ?? 0) ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .slice(0, input.limit);

    const propositionIds: string[] = [];

    for (const proposition of ready) {
      try {
        const liveAt = proposition.publishedAt?.toISOString();
        if (!liveAt) {
          throw new ArenaValidationError(
            "proposition.auto_publish_missing_published_at",
            `Scheduled proposition ${proposition.id} is missing publishedAt`,
          );
        }

        const live = await this.propositionEngine.publishLiveProposition({
          propositionId: proposition.id,
          liveAt,
          updatedByUserId: actorUserId,
        });

        await this.audits.record({
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: live.id,
          action: PROPOSITION_AUDIT_ACTIONS.autoPublishedLive,
          actorUserId,
          reason: "scheduler_auto_publish_ready_proposition",
          note: "Automatically promoted scheduled proposition to live",
          metadata: {
            publishedAt: liveAt,
            liveAt,
            marketEnabled: live.marketEnabled,
          },
        });

        propositionIds.push(live.id);
      } catch (error) {
        this.logger.error(
          {
            propositionId: proposition.id,
            error: error instanceof Error ? error.message : "Unknown auto publish error",
          },
          "Failed to auto publish scheduled proposition",
        );
      }
    }

    return {
      processedAt: now,
      processedCount: propositionIds.length,
      propositionIds,
    };
  }

  async finalizeReadyLivePropositions(input: {
    now?: string;
    actorUserId?: string;
    limit?: number;
  } = {}): Promise<FinalizeReadyLivePropositionsResult> {
    const now = input.now ?? new Date().toISOString();
    const actorUserId = input.actorUserId ?? DEFAULT_AUTOMATION_ACTOR_USER_ID;
    const propositions = await this.propositions.list({ status: "live" });
    const propositionIds: string[] = [];

    for (const proposition of propositions.slice(0, input.limit)) {
      try {
        const reveal = await this.freezeReveal.finalizeRevealPreparation({
          propositionId: proposition.id,
          now,
          updatedByUserId: actorUserId,
        });

        await this.audits.record({
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: proposition.id,
          action: PROPOSITION_AUDIT_ACTIONS.autoPreparedReveal,
          actorUserId,
          reason: "scheduler_auto_prepare_reveal",
          note: "Automatically finalized reveal preparation for ready live proposition",
          metadata: {
            triggerReason: reveal.readiness.triggerReason,
            frozenAt: reveal.frozenAt,
            revealStartedAt: reveal.revealStartedAt,
            resultComputedAt: reveal.resultComputedAt,
            resultKind: reveal.officialResult.resultKind,
            winningOption: reveal.officialResult.winningOption,
            voidReason: reveal.officialResult.voidReason,
          },
        });

        propositionIds.push(proposition.id);
      } catch (error) {
        if (
          error instanceof ArenaValidationError &&
          error.code === "proposition.not_ready_for_freeze"
        ) {
          continue;
        }

        this.logger.error(
          {
            propositionId: proposition.id,
            error:
              error instanceof Error ? error.message : "Unknown finalize reveal error",
          },
          "Failed to auto finalize reveal preparation",
        );
      }
    }

    return {
      processedAt: now,
      processedCount: propositionIds.length,
      propositionIds,
    };
  }

  async settleReadyRevealingPropositions(input: {
    now?: string;
    actorUserId?: string;
    limit?: number;
    platformFeeBps?: number;
  } = {}): Promise<SettleReadyRevealingPropositionsResult> {
    const now = input.now ?? new Date().toISOString();
    const actorUserId = input.actorUserId ?? DEFAULT_AUTOMATION_ACTOR_USER_ID;
    const platformFeeBps = input.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
    const propositions = await this.propositions.list({ status: "revealing" });
    const propositionIds: string[] = [];

    for (const proposition of propositions.slice(0, input.limit)) {
      try {
        const market = await this.markets.findByPropositionId(proposition.id);
        if (!market || market.status !== "frozen_for_reveal") {
          continue;
        }

        // When the validation-chain runtime is active, local settlement must wait
        // for the projected on-chain resolution; otherwise queued freeze/resolve
        // commands can be blocked by the local state advancing too far ahead.
        if (
          proposition.marketEnabled &&
          this.validationChainRuntime &&
          (market.chainStatus !== "resolved" ||
            market.chainResolvedAt === null ||
            market.resolutionTxHash === null)
        ) {
          continue;
        }

        const settlement = await this.validationSettlement.settleValidationMarket({
          propositionId: proposition.id,
          settledAt: now,
          platformFeeBps,
        });

        await this.audits.record({
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: proposition.id,
          action: PROPOSITION_AUDIT_ACTIONS.autoSettled,
          actorUserId,
          reason: "scheduler_auto_settle_revealing_proposition",
          note: "Automatically settled revealing proposition",
          metadata: {
            settledAt: settlement.settledAt,
            resultKind: settlement.officialResult.resultKind,
            winningOption: settlement.officialResult.winningOption,
            voidReason: settlement.officialResult.voidReason,
            settledBetCount: settlement.settledBetCount,
          },
        });

        propositionIds.push(proposition.id);
      } catch (error) {
        this.logger.error(
          {
            propositionId: proposition.id,
            error: error instanceof Error ? error.message : "Unknown auto settlement error",
          },
          "Failed to auto settle revealing proposition",
        );
      }
    }

    return {
      processedAt: now,
      processedCount: propositionIds.length,
      propositionIds,
    };
  }

  async runDuePropositionTransitions(input: {
    now?: string;
    actorUserId?: string;
    limit?: number;
    platformFeeBps?: number;
  } = {}): Promise<RunDuePropositionTransitionsResult> {
    const now = input.now ?? new Date().toISOString();
    const actorUserId = input.actorUserId ?? DEFAULT_AUTOMATION_ACTOR_USER_ID;

    const published = await this.publishReadyScheduledPropositions({
      now,
      actorUserId,
      limit: input.limit,
    });
    const revealPrepared = await this.finalizeReadyLivePropositions({
      now,
      actorUserId,
      limit: input.limit,
    });
    const settled = await this.settleReadyRevealingPropositions({
      now,
      actorUserId,
      limit: input.limit,
      platformFeeBps: input.platformFeeBps,
    });

    return {
      processedAt: now,
      published,
      revealPrepared,
      settled,
    };
  }
}
