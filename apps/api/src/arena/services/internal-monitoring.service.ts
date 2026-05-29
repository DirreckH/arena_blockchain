import { Injectable, Optional } from "@nestjs/common";
import { existsSync } from "node:fs";
import type { QueueOverviewSnapshot } from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import {
  type BackendRuntimeContractChecklistItemViewModel,
  type BackendRuntimeContractCommandSetViewModel,
  type BackendRuntimeContractReleaseReadinessViewModel,
  type BackendValidationRehearsalViewModel,
  type BackendRuntimeContractViewModel,
  type QualityAnomalyMonitoringItemViewModel,
  type SampleShortageMonitoringItemViewModel,
  type ValidationChainCommandRecoveryReason,
  type ValidationChainContractStateViewModel,
  type ValidationChainRuntimeReadinessDependencyViewModel,
  type ValidationChainRuntimeReadinessViewModel,
  type ValidationLifecycleDriftOperatorGuidanceViewModel,
  type ValidationLifecycleDriftMonitoringItemViewModel,
  type ValidationChainMonitoringViewModel,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { resolveFromWorkspaceRoot } from "../../common/utils/workspace-root.util";
import { AppConfigService } from "../../config/app-config.service";
import { BlockchainService } from "../../blockchain/blockchain.service";
import { HealthService } from "../../health/health.service";
import { AppQueueService } from "../../queue/queue.service";
import { RedisService } from "../../queue/redis.service";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import {
  buildValidationLifecycleSnapshot,
  type ValidationLifecycleDriftReason,
} from "../validation-lifecycle";
import { ValidationChainContractService } from "../validation-chain/validation-chain-contract.service";
import { ValidationChainAlertService } from "../validation-chain/validation-chain-alert.service";
import {
  ValidationContractMarketState,
  type ValidationChainAutomaticCommand,
} from "../validation-chain/validation-chain.types";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";

const DEFAULT_DEADLINE_WINDOW_MINUTES = 60;
const VALIDATION_RUNBOOK_PATH = "docs/contracts/arena-validation-chain-runbook.md";
const VALIDATION_REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "RPC_URL",
  "CHAIN_ID",
  "ARENA_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_ENVIRONMENT",
  "ARENA_VALIDATION_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_SYNC_CONFIRMATIONS",
  "ARENA_VALIDATION_SYNC_BATCH_SIZE",
  "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS",
  "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
  "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
  "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
] as const;
const VALIDATION_OPTIONAL_ENV_KEYS = [
  "ARENA_VALIDATION_ADMIN_ADDRESS",
  "ARENA_VALIDATION_OPERATOR_ADDRESS",
  "ARENA_VALIDATION_ORACLE_ADDRESS",
  "ARENA_VALIDATION_PAUSER_ADDRESS",
] as const;
const VALIDATION_PREFLIGHT_COMMANDS = [
  "pnpm run validation:env:check",
  "pnpm run validation:deps:check",
  "pnpm run validation:chain:check",
  "pnpm run validation:db:deploy",
  "pnpm run validation:db:status",
] as const;
const LOCAL_VALIDATION_PREFLIGHT_COMMANDS = [
  "pnpm run validation:prepare:local",
  "pnpm run validation:preflight",
  "pnpm run validation:db:deploy",
  "pnpm run validation:db:status",
] as const;
const RUNTIME_CONTRACT_COMMANDS: BackendRuntimeContractCommandSetViewModel = {
  install: ["pnpm install", "pnpm run deps:up"],
  dev: ["pnpm run api:dev"],
  typecheck: ["pnpm run api:typecheck"],
  unitTest: ["pnpm --filter @arena/shared test"],
  integrationTest: ["pnpm --filter @arena/api test:arena"],
  e2eOrSmoke: ["pnpm run validation:test"],
  productionBuild: ["pnpm run backend:build"],
  validationLocalPrepare: ["pnpm run validation:prepare:local"],
  databaseMigrate: [
    "pnpm run api:prisma:deploy",
    "pnpm run validation:db:deploy",
    "pnpm run validation:db:status",
  ],
  preflight: ["pnpm run validation:preflight"],
};
const VALIDATION_REHEARSAL_TARGET_OUTCOME =
  "One proposition completes publish -> local bet -> on-chain placeBet -> manual or scheduled sync -> projection -> settlement against deployed validation infrastructure.";

const buildTopFlags = (
  reviews: Array<{ flags: string[] }>,
): Array<{ flag: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    for (const flag of review.flags) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([flag, count]) => ({ flag, count }));
};

@Injectable()
export class InternalMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly blockchain: BlockchainService,
    private readonly redis: RedisService,
    private readonly health: HealthService,
    private readonly queue: AppQueueService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly reputations: UserReputationRepository,
    private readonly counters: EffectiveSampleCounterService,
    @Optional()
    private readonly validationContract?: ValidationChainContractService,
    @Optional()
    private readonly validationChainAlerts?: ValidationChainAlertService,
  ) {}

  async listSampleShortage(
    nowIso = new Date().toISOString(),
    deadlineWithinMinutes = DEFAULT_DEADLINE_WINDOW_MINUTES,
    db?: ArenaDbClient,
  ): Promise<SampleShortageMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({ status: "live" }, tx);
      const now = new Date(nowIso);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          const refreshedCounter = await this.counters.rebuildCounterForProposition(
            proposition.id,
            tx,
          );
          if (refreshedCounter.hasReachedMinEffectiveSample) {
            return null;
          }

          const deadlineAt =
            proposition.liveAt === null
              ? null
              : new Date(
                  proposition.liveAt.getTime() +
                    proposition.maxDurationSeconds * 1000,
                );
          const remainingSeconds =
            deadlineAt === null
              ? null
              : Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000));

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            status: proposition.status,
            liveAt: proposition.liveAt?.toISOString() ?? null,
            deadlineAt: deadlineAt?.toISOString() ?? null,
            remainingSeconds,
            minEffectiveSample: proposition.minEffectiveSample,
            effectiveSampleCount: refreshedCounter.effectiveSampleCount,
            reviewedResponseCount: refreshedCounter.reviewedResponses,
            shortageCount: Math.max(
              0,
              proposition.minEffectiveSample - refreshedCounter.effectiveSampleCount,
            ),
            nearingDeadline:
              remainingSeconds !== null &&
              remainingSeconds <= deadlineWithinMinutes * 60,
          } satisfies SampleShortageMonitoringItemViewModel;
        }),
      );

      return items
        .filter((item): item is SampleShortageMonitoringItemViewModel => item !== null)
        .sort((left, right) => {
          const leftSeconds = left.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
          const rightSeconds = right.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
          return leftSeconds - rightSeconds;
        });
    });
  }

  async listQualityAnomalies(
    db?: ArenaDbClient,
  ): Promise<QualityAnomalyMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({}, tx);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          if (["draft", "scheduled", "archived"].includes(proposition.status)) {
            return null;
          }

          const [responses, reviews] = await Promise.all([
            this.responses.listLatestByProposition(proposition.id, tx),
            this.reviews.listFinalizedByPropositionId(proposition.id, tx),
          ]);

          if (reviews.length === 0) {
            return null;
          }

          const invalidCount = reviews.filter((review) => review.status === "invalid").length;
          const fraudSuspectedCount = reviews.filter(
            (review) => review.status === "fraud_suspected",
          ).length;
          const flaggedCount = reviews.filter((review) => review.flags.length > 0).length;
          const invalidRate = invalidCount / reviews.length;
          const anomalyRate = flaggedCount / reviews.length;
          const respondentIds = Array.from(
            new Set(responses.map((response) => response.userId)),
          );
          const reputations = await Promise.all(
            respondentIds.map((userId) => this.reputations.findByUserId(userId, tx)),
          );
          const riskyRespondentCount = reputations.filter(
            (reputation) => reputation?.reputationLevel === "risky",
          ).length;

          if (
            invalidRate < 0.3 &&
            anomalyRate < 0.3 &&
            fraudSuspectedCount === 0 &&
            riskyRespondentCount === 0
          ) {
            return null;
          }

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            status: proposition.status,
            reviewedResponseCount: reviews.length,
            validCount: reviews.filter((review) => review.status === "valid").length,
            partialValidCount: reviews.filter(
              (review) => review.status === "partial_valid",
            ).length,
            invalidCount,
            fraudSuspectedCount,
            flaggedCount,
            invalidRate,
            anomalyRate,
            riskyRespondentCount,
            topFlags: buildTopFlags(reviews),
          } satisfies QualityAnomalyMonitoringItemViewModel;
        }),
      );

      return items
        .filter((item): item is QualityAnomalyMonitoringItemViewModel => item !== null)
        .sort((left, right) => {
          if (left.anomalyRate !== right.anomalyRate) {
            return right.anomalyRate - left.anomalyRate;
          }

          if (left.invalidRate !== right.invalidRate) {
            return right.invalidRate - left.invalidRate;
          }

          return right.riskyRespondentCount - left.riskyRespondentCount;
        });
    });
  }

  async listValidationLifecycleDrift(
    db?: ArenaDbClient,
  ): Promise<ValidationLifecycleDriftMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({}, tx);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          if (!proposition.marketEnabled) {
            return null;
          }

          const market = await this.markets.findByPropositionId(proposition.id, tx);
          const validationLifecycle = buildValidationLifecycleSnapshot(
            proposition,
            market,
          );

          if (!validationLifecycle.driftReason) {
            return null;
          }

          const onChainState = await this.readOnChainState(
            validationLifecycle.chainMarketId,
          );
          const operatorGuidance =
            this.buildValidationLifecycleOperatorGuidance({
              propositionId: proposition.id,
              marketId: validationLifecycle.marketId,
              propositionStatus: validationLifecycle.propositionStatus,
              marketStatus: validationLifecycle.marketStatus,
              localChainStatus: validationLifecycle.chainStatus,
              onChainState,
              driftReason: validationLifecycle.driftReason,
              hasOfficialResult:
                proposition.resultComputedAt !== null &&
                proposition.resultKind !== null,
            });

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            propositionStatus: validationLifecycle.propositionStatus,
            marketId: validationLifecycle.marketId,
            marketStatus: validationLifecycle.marketStatus,
            chainMarketId: validationLifecycle.chainMarketId,
            chainStatus: validationLifecycle.chainStatus,
            onChainState,
            chainSyncedAt: validationLifecycle.chainSyncedAt,
            publishedAt: proposition.publishedAt?.toISOString() ?? null,
            liveAt: proposition.liveAt?.toISOString() ?? null,
            frozenAt: proposition.frozenAt?.toISOString() ?? null,
            revealStartedAt: proposition.revealStartedAt?.toISOString() ?? null,
            resultComputedAt: proposition.resultComputedAt?.toISOString() ?? null,
            settledAt: proposition.settledAt?.toISOString() ?? null,
            driftReason: validationLifecycle.driftReason,
            operatorGuidance,
          } satisfies ValidationLifecycleDriftMonitoringItemViewModel;
        }),
      );

      return items
        .filter(
          (item): item is ValidationLifecycleDriftMonitoringItemViewModel =>
            item !== null,
        )
        .sort((left, right) => {
          const leftRank = this.getDriftSeverityRank(left.driftReason);
          const rightRank = this.getDriftSeverityRank(right.driftReason);
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          const leftTime = this.getLifecycleSortTime(left);
          const rightTime = this.getLifecycleSortTime(right);
          return rightTime - leftTime;
        });
    });
  }

  async getValidationChainHealth(
    nowIso = new Date().toISOString(),
    db?: ArenaDbClient,
  ): Promise<ValidationChainMonitoringViewModel | null> {
    if (!this.validationChainAlerts) {
      return null;
    }

    return this.validationChainAlerts.getHealthSnapshot(nowIso, db);
  }

  async getValidationChainRuntimeReadiness(): Promise<ValidationChainRuntimeReadinessViewModel> {
    const checkedAt = new Date().toISOString();
    const dependencies: ValidationChainRuntimeReadinessViewModel["dependencies"] = [];

    this.pushEnvDependency(dependencies);
    dependencies.push(await this.checkDatabaseDependency());
    dependencies.push(await this.checkRedisDependency());
    dependencies.push(await this.checkRpcDependency());
    dependencies.push(this.checkArenaArtifactDependency());
    dependencies.push(this.checkValidationArtifactDependency());
    dependencies.push(await this.checkValidationContractDependency());
    dependencies.push(...(await this.checkValidationDeploymentDependencies()));

    return {
      status: dependencies.every((item) => item.status === "up") ? "ok" : "degraded",
      checkedAt,
      validationEnvironment: this.config.validationEnvironment,
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl,
      arenaContractAddress: this.config.arenaContractAddress,
      validationContractAddress: this.config.validationContractAddress,
      dependencies,
      requiredEnvKeys: [...VALIDATION_REQUIRED_ENV_KEYS],
      optionalEnvKeys: [...VALIDATION_OPTIONAL_ENV_KEYS],
      preflightCommands: this.getValidationPreflightCommands(),
      runbookPath: VALIDATION_RUNBOOK_PATH,
      operatorActions: this.buildRuntimeReadinessActions(dependencies),
    };
  }

  async getRuntimeContract(): Promise<BackendRuntimeContractViewModel> {
    const generatedAt = new Date().toISOString();
    const [readiness, queues, validationChain] = await Promise.all([
      this.health.getReadinessSnapshot(),
      this.queue.getQueueOverview(),
      this.getValidationChainRuntimeReadiness(),
    ]);

    const releaseChecklist = this.buildRuntimeContractChecklist({
      readiness,
      queues,
      validationChain,
    });
    const releaseReadiness = this.buildRuntimeReleaseReadiness(releaseChecklist);
    const validationRehearsal = this.buildValidationRehearsalContract({
      readiness,
      queues,
      validationChain,
    });

    return {
      status:
        readiness.status === "ok" &&
        queues.status === "ok" &&
        validationChain.status === "ok"
          ? "ok"
          : "degraded",
      generatedAt,
      environment: {
        nodeEnv: this.config.nodeEnv,
        validationEnvironment: this.config.validationEnvironment,
        port: this.config.port,
      },
      health: {
        live: this.health.getLiveSnapshot(),
        readiness,
        queues,
      },
      validationChain,
      validationRehearsal,
      commands: structuredClone(RUNTIME_CONTRACT_COMMANDS),
      releaseReadiness,
      releaseChecklist,
    };
  }

  private getDriftSeverityRank(reason: ValidationLifecycleDriftReason): number {
    switch (reason) {
      case "market_missing":
        return 0;
      case "chain_market_not_resolved":
        return 1;
      case "chain_market_not_frozen":
        return 2;
      case "chain_market_not_opened":
        return 3;
      case "chain_market_not_created":
        return 4;
      default:
        return 99;
    }
  }

  private getLifecycleSortTime(
    item: ValidationLifecycleDriftMonitoringItemViewModel,
  ): number {
    return Date.parse(
      item.settledAt ??
        item.resultComputedAt ??
        item.revealStartedAt ??
        item.frozenAt ??
        item.liveAt ??
        item.publishedAt ??
        "1970-01-01T00:00:00.000Z",
    );
  }

  private async readOnChainState(
    chainMarketId: string | null,
  ): Promise<ValidationChainContractStateViewModel | null> {
    if (!this.validationContract || !chainMarketId) {
      return null;
    }

    try {
      const market = await this.validationContract.getMarketOrNull(chainMarketId);
      return this.toContractStateView(market?.state ?? null);
    } catch {
      return null;
    }
  }

  private buildValidationLifecycleOperatorGuidance(input: {
    propositionId: string;
    marketId: string | null;
    propositionStatus: ValidationLifecycleDriftMonitoringItemViewModel["propositionStatus"];
    marketStatus: ValidationLifecycleDriftMonitoringItemViewModel["marketStatus"];
    localChainStatus: ValidationLifecycleDriftMonitoringItemViewModel["chainStatus"];
    onChainState: ValidationChainContractStateViewModel | null;
    driftReason: ValidationLifecycleDriftReason;
    hasOfficialResult: boolean;
  }): ValidationLifecycleDriftOperatorGuidanceViewModel {
    const recoveryRoute = `/arena/internal/validation-chain/propositions/${input.propositionId}/recover-command`;
    const projectionRepairActions =
      input.marketId === null
        ? ["/arena/internal/validation-chain/sync"]
        : [
            "/arena/internal/validation-chain/sync",
            `/arena/internal/validation-chain/markets/${input.marketId}/replay-projection`,
          ];
    const unsafePreLiveActions = [
      `/arena/internal/validation-chain/propositions/${input.propositionId}/cancel-market`,
      `${VALIDATION_RUNBOOK_PATH}#unsafe-pre-live-drift-policy`,
    ];
    const runbookActions = [VALIDATION_RUNBOOK_PATH];

    const queueRecovery = (
      summary: string,
      recoveryReason: ValidationChainCommandRecoveryReason,
      plannedCommands: ValidationChainAutomaticCommand[],
    ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
      kind: "queue_recovery",
      summary,
      recoveryReason,
      plannedCommands,
      operatorActions: [recoveryRoute],
    });

    const projectionRepair = (
      summary: string,
    ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
      kind: "projection_repair",
      summary,
      recoveryReason: null,
      plannedCommands: [],
      operatorActions: [...projectionRepairActions],
    });

    const manualIntervention = (
      summary: string,
      operatorActions: string[],
    ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
      kind: "manual_intervention",
      summary,
      recoveryReason: null,
      plannedCommands: [],
      operatorActions,
    });

    switch (input.driftReason) {
      case "market_missing":
        return manualIntervention(
          "The local validation market row is missing. Reconstruct or investigate local market state before replaying projection or queueing chain commands.",
          [...runbookActions],
        );
      case "chain_market_not_created":
        if (input.onChainState === null) {
          return queueRecovery(
            "Queue create_market and open_market to recreate the missing live chain market.",
            "create_open_missing_market",
            ["create_market", "open_market"],
          );
        }

        return projectionRepair(
          "An on-chain market already exists, but the local validation projection has not caught up. Run sync or replay projection before queueing new chain commands.",
        );
      case "chain_market_not_opened":
        if (input.onChainState === "pre_live") {
          return queueRecovery(
            "Queue open_market to move the pre-live chain market into the live state.",
            "open_pre_live_market",
            ["open_market"],
          );
        }

        if (input.onChainState === "live") {
          return projectionRepair(
            "The on-chain market is already live, but the local validation projection still shows it as pre-live. Run sync or replay projection first.",
          );
        }

        return manualIntervention(
          "The local market is live but the chain market is not in a safe state for automatic open recovery. Investigate chain/runtime drift before queueing more commands.",
          [...runbookActions],
        );
      case "chain_market_not_frozen":
        if (input.onChainState === "live") {
          if (
            input.propositionStatus === "frozen" &&
            input.marketStatus === "frozen_for_reveal"
          ) {
            return queueRecovery(
              "Queue freeze_market to align the live chain market with the local frozen state.",
              "freeze_live_market",
              ["freeze_market"],
            );
          }

          if (
            (input.propositionStatus === "revealing" ||
              input.propositionStatus === "settled") &&
            input.hasOfficialResult
          ) {
            return queueRecovery(
              "Queue freeze_market and resolve_market to align the live chain market with the local adjudicated result.",
              "freeze_resolve_live_market",
              ["freeze_market", "resolve_market"],
            );
          }
        }

        if (input.onChainState === "frozen" || input.onChainState === "resolved") {
          return projectionRepair(
            "The chain market is already past the freeze boundary, but the local projection is stale. Run sync or replay projection before queueing new commands.",
          );
        }

        if (
          input.onChainState === "pre_live" ||
          input.localChainStatus === "pre_live"
        ) {
          return manualIntervention(
            "Do not reopen a pre-live chain market after the local freeze boundary. Cancel the chain market or escalate operator review before any further settlement actions.",
            unsafePreLiveActions,
          );
        }

        return manualIntervention(
          "The local market has crossed the freeze boundary, but no safe automatic recovery plan is available for the current chain state.",
          [...runbookActions],
        );
      case "chain_market_not_resolved":
        if (input.onChainState === "frozen") {
          if (input.propositionStatus === "settled") {
            return queueRecovery(
              "Queue resolve_market to finalize the already-frozen chain market with the local settled result.",
              "resolve_settled_market",
              ["resolve_market"],
            );
          }

          if (input.propositionStatus === "revealing") {
            return queueRecovery(
              "Queue resolve_market to finalize the already-frozen chain market with the local revealing result.",
              "resolve_frozen_market",
              ["resolve_market"],
            );
          }
        }

        if (input.onChainState === "live" && input.hasOfficialResult) {
          return queueRecovery(
            "Queue freeze_market and resolve_market to align the live chain market with the local adjudicated result.",
            "freeze_resolve_live_market",
            ["freeze_market", "resolve_market"],
          );
        }

        if (input.onChainState === "resolved") {
          return projectionRepair(
            "The chain market is already resolved, but the local settlement projection is stale. Run sync or replay projection to catch up.",
          );
        }

        if (
          input.onChainState === "pre_live" ||
          input.localChainStatus === "pre_live"
        ) {
          return manualIntervention(
            "Do not reopen a pre-live chain market after local adjudication or settlement. Cancel the chain market or escalate operator review before any further settlement actions.",
            unsafePreLiveActions,
          );
        }

        if (input.onChainState === "cancelled") {
          return manualIntervention(
            "The chain market was cancelled while the local proposition has already advanced to settlement. Manual incident review is required before any further settlement handling.",
            [...runbookActions],
          );
        }

        return manualIntervention(
          "The local proposition is awaiting resolved chain settlement, but no safe automatic recovery plan is available for the current chain state.",
          [...runbookActions],
        );
    }
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

  private pushEnvDependency(
    dependencies: ValidationChainRuntimeReadinessViewModel["dependencies"],
  ): void {
    const signerKeys = [
      this.config.validationOperatorPrivateKey,
      this.config.validationOraclePrivateKey,
      this.config.validationPauserPrivateKey,
    ];
    const missingKeys = signerKeys.some((value) => !value || value.trim().length === 0);

    dependencies.push(
      missingKeys
        ? {
            name: "env",
            status: "down",
            details:
              "Validation operator/oracle/pauser signer keys are not fully configured",
          }
        : {
            name: "env",
            status: "up",
          },
    );
  }

  private async checkDatabaseDependency(): Promise<
    ValidationChainRuntimeReadinessViewModel["dependencies"][number]
  > {
    try {
      await this.prisma.assertReady();
      return { name: "database", status: "up" };
    } catch (error) {
      return {
        name: "database",
        status: "down",
        details: error instanceof Error ? error.message : "Unknown database error",
      };
    }
  }

  private async checkRedisDependency(): Promise<
    ValidationChainRuntimeReadinessViewModel["dependencies"][number]
  > {
    try {
      await this.redis.ping();
      return { name: "redis", status: "up" };
    } catch (error) {
      return {
        name: "redis",
        status: "down",
        details: error instanceof Error ? error.message : "Unknown redis error",
      };
    }
  }

  private async checkRpcDependency(): Promise<
    ValidationChainRuntimeReadinessViewModel["dependencies"][number]
  > {
    try {
      await this.blockchain.assertReady();
      return { name: "rpc", status: "up" };
    } catch (error) {
      return {
        name: "rpc",
        status: "down",
        details: error instanceof Error ? error.message : "Unknown rpc error",
      };
    }
  }

  private checkArenaArtifactDependency(): ValidationChainRuntimeReadinessViewModel["dependencies"][number] {
    const artifactPath = resolveFromWorkspaceRoot(
      "artifacts",
      "contracts",
      "Arena.sol",
      "Arena.json",
    );

    return existsSync(artifactPath)
      ? { name: "arena_artifact", status: "up" }
      : {
          name: "arena_artifact",
          status: "down",
          details: `Arena contract artifact missing at ${artifactPath}`,
        };
  }

  private checkValidationArtifactDependency(): ValidationChainRuntimeReadinessViewModel["dependencies"][number] {
    if (!this.validationContract) {
      return {
        name: "validation_artifact",
        status: "down",
        details: "Validation-chain contract service is not available",
      };
    }

    const artifactPath = this.validationContract.getArtifactPath();
    return existsSync(artifactPath)
      ? { name: "validation_artifact", status: "up" }
      : {
          name: "validation_artifact",
          status: "down",
          details: `Validation contract artifact missing at ${artifactPath}`,
        };
  }

  private async checkValidationContractDependency(): Promise<
    ValidationChainRuntimeReadinessViewModel["dependencies"][number]
  > {
    if (!this.validationContract) {
      return {
        name: "validation_contract",
        status: "down",
        details: "Validation-chain contract service is not available",
      };
    }

    try {
      await this.validationContract.assertReady();
      const contract = await this.validationContract.getReadOnlyContract();
      await contract.paused();
      return { name: "validation_contract", status: "up" };
    } catch (error) {
      return {
        name: "validation_contract",
        status: "down",
        details:
          error instanceof Error
            ? error.message
            : "Unknown validation contract readiness error",
      };
    }
  }

  private async checkValidationDeploymentDependencies(): Promise<
    ValidationChainRuntimeReadinessViewModel["dependencies"]
  > {
    if (!this.validationContract) {
      return [
        {
          name: "validation_contract_code",
          status: "down",
          details: "Validation-chain contract service is not available",
        },
        {
          name: "validation_contract_bytecode",
          status: "down",
          details: "Validation-chain contract service is not available",
        },
        {
          name: "validation_operator_signer",
          status: "down",
          details: "Validation-chain contract service is not available",
        },
        {
          name: "validation_oracle_signer",
          status: "down",
          details: "Validation-chain contract service is not available",
        },
        {
          name: "validation_pauser_signer",
          status: "down",
          details: "Validation-chain contract service is not available",
        },
      ];
    }

    try {
      const readiness = await this.validationContract.getDeploymentReadiness();
      const signerDependencies = readiness.signers.map((signer) => {
        const name =
          signer.role === "operator"
            ? "validation_operator_signer"
            : signer.role === "oracle"
              ? "validation_oracle_signer"
              : "validation_pauser_signer";
        const issues: string[] = [];

        if (!signer.hasBalance) {
          issues.push(`address ${signer.address} has zero native token balance`);
        }

        if (!signer.hasRequiredRole) {
          issues.push(`address ${signer.address} is missing required on-chain role`);
        }

        return issues.length === 0
          ? ({
              name,
              status: "up",
            } satisfies ValidationChainRuntimeReadinessViewModel["dependencies"][number])
          : ({
              name,
              status: "down",
              details: issues.join("; "),
            } satisfies ValidationChainRuntimeReadinessViewModel["dependencies"][number]);
      });

      return [
        readiness.hasRuntimeCode
          ? {
              name: "validation_contract_code",
              status: "up",
            }
          : {
              name: "validation_contract_code",
              status: "down",
              details: `No runtime code found at ${readiness.contractAddress}`,
            },
        readiness.runtimeBytecodeMatchesArtifact
          ? {
              name: "validation_contract_bytecode",
              status: "up",
            }
          : {
              name: "validation_contract_bytecode",
              status: "down",
              details:
                "On-chain runtime bytecode does not match the local ArenaValidationMarket artifact",
            },
        ...signerDependencies,
      ];
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : "Unknown validation deployment readiness error";

      return [
        {
          name: "validation_contract_code",
          status: "down",
          details,
        },
        {
          name: "validation_contract_bytecode",
          status: "down",
          details,
        },
        {
          name: "validation_operator_signer",
          status: "down",
          details,
        },
        {
          name: "validation_oracle_signer",
          status: "down",
          details,
        },
        {
          name: "validation_pauser_signer",
          status: "down",
          details,
        },
      ];
    }
  }

  private buildRuntimeReadinessActions(
    dependencies: ValidationChainRuntimeReadinessViewModel["dependencies"],
  ): ValidationChainRuntimeReadinessViewModel["operatorActions"] {
    return dependencies
      .filter((dependency) => dependency.status === "down")
      .map((dependency) => this.toRuntimeReadinessAction(dependency.name));
  }

  private toRuntimeReadinessAction(
    dependency: ValidationChainRuntimeReadinessDependencyViewModel["name"],
  ): ValidationChainRuntimeReadinessViewModel["operatorActions"][number] {
    const isLocal = this.isLocalValidationEnvironment();

    switch (dependency) {
      case "env":
        return {
          dependency,
          summary: "Populate the required validation-chain environment variables and rerun env preflight.",
          envKeys: [...VALIDATION_REQUIRED_ENV_KEYS],
          commands: isLocal
            ? [
                "pnpm run validation:prepare:local",
                "pnpm run validation:env:check",
              ]
            : ["pnpm run validation:env:check"],
        };
      case "database":
        return {
          dependency,
          summary: isLocal
            ? "Bring Postgres online with Docker Desktop or equivalent local services, then apply validation-chain migrations before retrying runtime checks."
            : "Bring Postgres online and apply validation-chain migrations before retrying runtime checks.",
          envKeys: ["DATABASE_URL"],
          commands: isLocal
            ? [
                "pnpm run validation:prepare:local",
                "pnpm run validation:db:deploy",
                "pnpm run validation:db:status",
                "pnpm run validation:deps:check",
              ]
            : [
                "pnpm run validation:deps:check",
                "pnpm run validation:db:deploy",
                "pnpm run validation:db:status",
              ],
        };
      case "redis":
        return {
          dependency,
          summary: isLocal
            ? "Restore Redis connectivity with Docker Desktop or equivalent local services so queue workers and validation sync jobs can run."
            : "Restore Redis connectivity so queue workers and validation sync jobs can run.",
          envKeys: ["REDIS_URL"],
          commands: isLocal
            ? ["pnpm run validation:prepare:local", "pnpm run validation:deps:check"]
            : ["pnpm run validation:deps:check"],
        };
      case "rpc":
        return {
          dependency,
          summary: "Restore RPC connectivity and confirm the configured chain id matches the provider.",
          envKeys: ["RPC_URL", "CHAIN_ID"],
          commands: isLocal
            ? [
                "pnpm run validation:prepare:local",
                "pnpm run validation:deps:check",
                "pnpm run validation:chain:check",
              ]
            : [
                "pnpm run validation:deps:check",
                "pnpm run validation:chain:check",
              ],
        };
      case "arena_artifact":
        return {
          dependency,
          summary: "Rebuild the root Arena contract artifact before running validation-chain operations.",
          envKeys: [],
          commands: ["pnpm exec hardhat compile"],
        };
      case "validation_artifact":
        return {
          dependency,
          summary: "Rebuild the validation contract artifact before running validation-chain operations.",
          envKeys: [],
          commands: ["pnpm exec hardhat compile"],
        };
      case "validation_contract":
        return {
          dependency,
          summary: "Verify the validation contract address, RPC, and contract availability before using validation-chain runtime commands.",
          envKeys: ["RPC_URL", "CHAIN_ID", "ARENA_VALIDATION_CONTRACT_ADDRESS"],
          commands: isLocal
            ? [
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : ["pnpm run validation:chain:check"],
        };
      case "validation_contract_code":
        return {
          dependency,
          summary: "Deploy or repoint the validation contract so runtime code exists at the configured address.",
          envKeys: ["RPC_URL", "CHAIN_ID", "ARENA_VALIDATION_CONTRACT_ADDRESS"],
          commands: isLocal
            ? [
                "pnpm exec hardhat compile",
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : [
                "pnpm run validation:deploy -- --network <network>",
                "pnpm run validation:chain:check",
              ],
        };
      case "validation_contract_bytecode":
        return {
          dependency,
          summary: "Recompile and redeploy the validation contract when the on-chain runtime bytecode drifts from the local artifact.",
          envKeys: ["RPC_URL", "CHAIN_ID", "ARENA_VALIDATION_CONTRACT_ADDRESS"],
          commands: isLocal
            ? [
                "pnpm exec hardhat compile",
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : [
                "pnpm exec hardhat compile",
                "pnpm run validation:deploy -- --network <network>",
                "pnpm run validation:chain:check",
              ],
        };
      case "validation_operator_signer":
        return {
          dependency,
          summary: "Fund the operator signer and grant OPERATOR_ROLE on the deployed validation contract.",
          envKeys: [
            "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
            "ARENA_VALIDATION_OPERATOR_ADDRESS",
          ],
          commands: isLocal
            ? [
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : ["pnpm run validation:chain:check"],
        };
      case "validation_oracle_signer":
        return {
          dependency,
          summary: "Fund the oracle signer and grant ORACLE_ROLE on the deployed validation contract.",
          envKeys: [
            "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
            "ARENA_VALIDATION_ORACLE_ADDRESS",
          ],
          commands: isLocal
            ? [
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : ["pnpm run validation:chain:check"],
        };
      case "validation_pauser_signer":
        return {
          dependency,
          summary: "Fund the pauser signer and grant PAUSER_ROLE on the deployed validation contract.",
          envKeys: [
            "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
            "ARENA_VALIDATION_PAUSER_ADDRESS",
          ],
          commands: isLocal
            ? [
                "pnpm run validation:deploy -- --network localhost",
                "pnpm run validation:chain:check",
              ]
            : ["pnpm run validation:chain:check"],
        };
      default:
        return {
          dependency,
          summary: "Inspect the validation-chain runbook and rerun the validation preflight commands.",
          envKeys: [],
          commands: this.getValidationPreflightCommands(),
        };
    }
  }

  private buildRuntimeContractChecklist(input: {
    readiness: BackendRuntimeContractViewModel["health"]["readiness"];
    queues: QueueOverviewSnapshot;
    validationChain: ValidationChainRuntimeReadinessViewModel;
  }): BackendRuntimeContractChecklistItemViewModel[] {
    const readinessCommands = ["GET /health/ready"];
    const schedulerQueue = input.queues.queues.find(
      (queue) => queue.name === "scheduler",
    );
    const readinessBlockingDependencies = input.readiness.dependencies
      .filter((dependency) => dependency.status !== "up")
      .map((dependency) => dependency.name);
    const queueBlockingDependencies = input.queues.queues
      .filter((queue) => queue.status !== "up" || queue.paused)
      .map((queue) => `${queue.name}_queue`);
    const validationBlockingDependencies = input.validationChain.dependencies
      .filter((dependency) => dependency.status !== "up")
      .map((dependency) => dependency.name);

    if (schedulerQueue?.status !== "up" || schedulerQueue?.paused) {
      readinessCommands.push("GET /system/queues/overview");
    }

    const envBlockingDependencies = input.validationChain.dependencies
      .filter((dependency) => dependency.name === "env" && dependency.status !== "up")
      .map((dependency) => dependency.name);
    const databaseBlockingDependencies = Array.from(
      new Set(
        [
          ...readinessBlockingDependencies.filter(
            (dependency) => dependency === "database",
          ),
          ...validationBlockingDependencies.filter(
            (dependency) => dependency === "database",
          ),
        ],
      ),
    );
    const buildBlockingDependencies = input.validationChain.dependencies
      .filter(
        (dependency) =>
          [
            "arena_artifact",
            "validation_artifact",
            "validation_contract_code",
            "validation_contract_bytecode",
          ].includes(dependency.name) && dependency.status !== "up",
      )
      .map((dependency) => dependency.name);
    const readinessGateBlockingDependencies = Array.from(
      new Set([
        ...readinessBlockingDependencies,
        ...queueBlockingDependencies,
      ]),
    );

    const checklist: BackendRuntimeContractChecklistItemViewModel[] = [
      {
        id: "env",
        status: envBlockingDependencies.length === 0 ? "ready" : "blocked",
        summary:
          "Populate backend and validation-chain environment variables before runtime preflight.",
        blockingDependencies: envBlockingDependencies,
        commands: [
          ...this.getValidationPreflightCommands(),
        ],
      },
      {
        id: "database",
        status:
          databaseBlockingDependencies.length === 0 ? "ready" : "blocked",
        summary:
          "Apply API and validation-chain migrations before starting production traffic.",
        blockingDependencies: databaseBlockingDependencies,
        commands: [...RUNTIME_CONTRACT_COMMANDS.databaseMigrate],
      },
      {
        id: "build",
        status: buildBlockingDependencies.length === 0 ? "ready" : "blocked",
        summary:
          "Build shared and API packages before deployment or production start.",
        blockingDependencies: buildBlockingDependencies,
        commands: [...RUNTIME_CONTRACT_COMMANDS.productionBuild],
      },
      {
        id: "readiness",
        status:
          readinessGateBlockingDependencies.length === 0 ? "ready" : "blocked",
        summary:
          "Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
        blockingDependencies: readinessGateBlockingDependencies,
        commands: [
          ...readinessCommands,
          "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
        ],
      },
    ];

    if (input.validationChain.status !== "ok") {
      checklist.push({
        id: "validation-runtime",
        status: "blocked",
        summary:
          "Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
        blockingDependencies: validationBlockingDependencies,
        commands: [
          ...input.validationChain.preflightCommands,
          ...input.validationChain.operatorActions.flatMap((item) => item.commands),
        ],
      });
    }

    return checklist;
  }

  private buildRuntimeReleaseReadiness(
    checklist: BackendRuntimeContractChecklistItemViewModel[],
  ): BackendRuntimeContractReleaseReadinessViewModel {
    const blockingDependencies = Array.from(
      new Set(
        checklist.flatMap((item) =>
          item.status === "blocked" ? item.blockingDependencies : [],
        ),
      ),
    );
    const completedGateCount = checklist.filter(
      (item) => item.status === "ready",
    ).length;

    return {
      status: blockingDependencies.length === 0 ? "ready" : "blocked",
      blockingDependencies,
      completedGateCount,
      totalGateCount: checklist.length,
    };
  }

  private buildValidationRehearsalContract(input: {
    readiness: BackendRuntimeContractViewModel["health"]["readiness"];
    queues: QueueOverviewSnapshot;
    validationChain: ValidationChainRuntimeReadinessViewModel;
  }): BackendValidationRehearsalViewModel {
    const readinessBlockingDependencies = input.readiness.dependencies
      .filter((dependency) => dependency.status !== "up")
      .map((dependency) => dependency.name);
    const queueBlockingDependencies = input.queues.queues
      .filter((queue) => queue.status !== "up" || queue.paused)
      .map((queue) => `${queue.name}_queue`);
    const validationBlockingDependencies = input.validationChain.dependencies
      .filter((dependency) => dependency.status !== "up")
      .map((dependency) => dependency.name);
    const blockingDependencies = Array.from(
      new Set([
        ...readinessBlockingDependencies,
        ...queueBlockingDependencies,
        ...validationBlockingDependencies,
      ]),
    );

    return {
      status: blockingDependencies.length === 0 ? "ready" : "blocked",
      targetOutcome: VALIDATION_REHEARSAL_TARGET_OUTCOME,
      runbookPath: VALIDATION_RUNBOOK_PATH,
      blockingDependencies,
      steps: [
        {
          id: "preflight",
          summary:
            "Clear backend, queue, database, Redis, RPC, signer, and contract blockers before attempting an environment-backed validation rehearsal.",
          commands: [
            "GET /arena/internal/monitoring/runtime-contract",
            ...input.validationChain.preflightCommands,
          ],
          evidence: [
            "GET /health/ready",
            "GET /system/queues/overview",
            "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
          ],
        },
        {
          id: "publish_and_open",
          summary:
            "Publish one market-enabled non-rolling binary proposition and let the runtime create/open the validation market.",
          commands: [
            "publishLiveProposition()",
            "POST /arena/internal/validation-chain/propositions/:propositionId/recover-command",
          ],
          evidence: [
            "GET /arena/internal/monitoring/validation-chain",
            "GET /arena/internal/monitoring/validation-lifecycle-drift",
          ],
        },
        {
          id: "local_bet_and_sync",
          summary:
            "Persist one local validation bet, place the matching on-chain position with the same wallet identity, then confirm sync can ingest the chain write.",
          commands: [
            "Validation contract placeBet(chainMarketId, option)",
            "POST /arena/internal/validation-chain/sync",
            "POST /arena/internal/validation-chain/backlog/reconcile",
          ],
          evidence: [
            "GET /arena/internal/monitoring/validation-chain",
            "POST /arena/internal/validation-chain/markets/:marketId/bets/:userId/reconcile",
          ],
        },
        {
          id: "freeze_and_resolve",
          summary:
            "Drive the proposition through freeze and official result resolution without reopening unsafe chain state.",
          commands: [
            "freezeForReveal()",
            "computeAndRecordOfficialResult()",
            "POST /arena/internal/validation-chain/propositions/:propositionId/recover-command",
          ],
          evidence: [
            "GET /arena/internal/monitoring/validation-lifecycle-drift",
            "GET /arena/internal/monitoring/validation-chain",
          ],
        },
        {
          id: "projection_and_settlement",
          summary:
            "Confirm the projector and settlement path converge on resolved market state, winning bet settlement, and replay-safe repeated sync.",
          commands: [
            "POST /arena/internal/validation-chain/sync",
            "POST /arena/internal/validation-chain/markets/:marketId/replay-projection",
          ],
          evidence: [
            "GET /arena/internal/monitoring/validation-chain",
            "GET /arena/internal/monitoring/validation-lifecycle-drift",
          ],
        },
      ],
    };
  }

  private isLocalValidationEnvironment(): boolean {
    return this.config.validationEnvironment === "local";
  }

  private getValidationPreflightCommands(): string[] {
    return this.isLocalValidationEnvironment()
      ? [...LOCAL_VALIDATION_PREFLIGHT_COMMANDS]
      : [...VALIDATION_PREFLIGHT_COMMANDS, "pnpm run validation:preflight"];
  }
}
