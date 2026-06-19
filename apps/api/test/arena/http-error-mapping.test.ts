import "reflect-metadata";

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpStatus,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { PinoLogger } from "nestjs-pino";

import { SystemRole } from "@arena/shared";

import { BlockchainService } from "../../src/blockchain/blockchain.service";
import { ArenaAdjudicationController } from "../../src/arena/adjudication.controller";
import { ArenaIdService } from "../../src/arena/arena-id.service";
import { ArenaValidationError } from "../../src/arena/arena.errors";
import { ArenaInternalDiscoveryConfigController } from "../../src/arena/internal-discovery-config.controller";
import { ArenaInternalDispatchController } from "../../src/arena/internal-dispatch.controller";
import { ArenaInternalMonitoringController } from "../../src/arena/internal-monitoring.controller";
import { ArenaInternalPropositionsController } from "../../src/arena/internal-propositions.controller";
import { ArenaInternalRewardsController } from "../../src/arena/internal-rewards.controller";
import { ArenaInternalResponsesController } from "../../src/arena/internal-responses.controller";
import { ArenaInternalValidationChainController } from "../../src/arena/internal-validation-chain.controller";
import { ArenaPublicController } from "../../src/arena/public.controller";
import { ArenaPublicDiscoveryController } from "../../src/arena/public-discovery.controller";
import { ArenaPublicRespondentLeaderboardController } from "../../src/arena/public-respondent-leaderboard.controller";
import { ArenaPropositionsController } from "../../src/arena/propositions.controller";
import { SystemKeyValueRepository } from "../../src/arena/repositories/system-key-value.repository";
import { ArenaRespondentAccountController } from "../../src/arena/respondent-account.controller";
import { ArenaRespondentResultsController } from "../../src/arena/respondent-results.controller";
import { ArenaValidationController } from "../../src/arena/validation.controller";
import { Public } from "../../src/common/decorators/public.decorator";
import { IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter";
import { ArenaSurfaceBoundaryGuard } from "../../src/common/guards/arena-surface-boundary.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { PrismaService } from "../../src/database/prisma.service";
import { HealthController } from "../../src/health/health.controller";
import { HealthService } from "../../src/health/health.service";
import { AppQueueService } from "../../src/queue/queue.service";
import { SystemController } from "../../src/system/system.controller";
import { RedisService } from "../../src/queue/redis.service";
import { AdjudicationViewService } from "../../src/arena/services/adjudication-view.service";
import { AccountViewService } from "../../src/arena/services/account-view.service";
import { AccountExportService } from "../../src/arena/services/account-export.service";
import { AccountPreferencesService } from "../../src/arena/services/account-preferences.service";
import { BetService } from "../../src/arena/services/bet.service";
import { DispatchEngineService } from "../../src/arena/services/dispatch-engine.service";
import { DiscoveryConfigService } from "../../src/arena/services/discovery-config.service";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { InternalPropositionOpsService } from "../../src/arena/services/internal-proposition-ops.service";
import { InternalRewardAuditService } from "../../src/arena/services/internal-reward-audit.service";
import { InternalResponseReviewOpsService } from "../../src/arena/services/internal-response-review-ops.service";
import { PropositionDraftService } from "../../src/arena/services/proposition-draft.service";
import { PublicDiscoveryService } from "../../src/arena/services/public-discovery.service";
import { QualityEngineService } from "../../src/arena/services/quality-engine.service";
import { RequesterComparisonSetService } from "../../src/arena/services/requester-comparison-set.service";
import { RequesterComparisonSetDeliveryPolicyService } from "../../src/arena/services/requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetDeliveryTransportService } from "../../src/arena/services/requester-comparison-set-delivery-transport.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { RequesterPropositionViewService } from "../../src/arena/services/requester-proposition-view.service";
import { RequesterReportPresetService } from "../../src/arena/services/requester-report-preset.service";
import { PublicIntegrityViewService } from "../../src/arena/services/public-integrity-view.service";
import { PublicResultViewService } from "../../src/arena/services/public-result-view.service";
import { PublicRespondentLeaderboardService } from "../../src/arena/services/public-respondent-leaderboard.service";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ResponseService } from "../../src/arena/services/response.service";
import { ValidationBetExecutionService } from "../../src/arena/services/validation-bet-execution.service";
import { ValidationProofRecordService } from "../../src/arena/services/validation-proof-record.service";
import { ValidationRehearsalCheckpointService } from "../../src/arena/services/validation-rehearsal-checkpoint.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
import { WatchlistService } from "../../src/arena/services/watchlist.service";
import { ValidationChainOperatorCommandService } from "../../src/arena/validation-chain/validation-chain-operator-command.service";
import { ValidationChainBetReconciliationService } from "../../src/arena/validation-chain/validation-chain-bet-reconciliation.service";
import { ValidationChainCommandRecoveryService } from "../../src/arena/validation-chain/validation-chain-command-recovery.service";
import { ValidationChainOracleService } from "../../src/arena/validation-chain/validation-chain-oracle.service";
import { ValidationChainPauserService } from "../../src/arena/validation-chain/validation-chain-pauser.service";
import { ValidationChainManualSyncService } from "../../src/arena/validation-chain/validation-chain-manual-sync.service";
import { ValidationChainProjectionReplayService } from "../../src/arena/validation-chain/validation-chain-projection-replay.service";
import {
  VALIDATION_CHAIN_STREAM_KEY,
  ValidationChainContractError,
} from "../../src/arena/validation-chain/validation-chain.types";
import {
  type ArenaHarness,
  createArenaHarness,
} from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment",
  title: "Will option A win?",
  description: "MVP binary proposition",
  options: ["A", "B"] as [string, string],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

type TestUser = {
  userId: string;
  chainId?: number;
  roles?: SystemRole[];
};

type JsonResponse = {
  status: number;
  body: any;
};

type HttpArenaContext = {
  app: INestApplication;
  baseUrl: string;
  harness: ArenaHarness;
};

@Injectable()
class TestAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userIdHeader = request.headers["x-test-user-id"];
    if (typeof userIdHeader !== "string" || userIdHeader.trim().length === 0) {
      throw new UnauthorizedException("Authentication required");
    }

    const rolesHeader = request.headers["x-test-roles"];
    const chainIdHeader = request.headers["x-test-chain-id"];
    const roles =
      typeof rolesHeader === "string" && rolesHeader.trim().length > 0
        ? (rolesHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value): value is SystemRole => value.length > 0) as SystemRole[])
        : undefined;
    const chainId =
      typeof chainIdHeader === "string" && chainIdHeader.trim().length > 0
        ? Number(chainIdHeader)
        : 1;

    request.user = {
      sub: userIdHeader.trim(),
      walletAddress: `wallet_${userIdHeader.trim()}`,
      chainId,
      roles,
    };
    request.requestId = request.requestId ?? "test-request-id";
    request.traceId = request.traceId ?? "test-trace-id";
    return true;
  }
}

@Controller("__test")
class TestErrorController {
  @Public()
  @Get("error")
  throwUnhandledError() {
    throw new Error("Unhandled test error");
  }
}

const createLiveProposition = async (
  harness: ArenaHarness,
  overrides: Partial<typeof propositionDraftInput> = {},
) => {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });

  return harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.UTC(2026, 3, 18, 10, minuteOffset, secondOffset, 0),
  ).toISOString();

const defaultReasonCodesByStatus = {
  valid: ["valid_consistent"],
  partial_valid: ["partial_valid_incomplete_detail"],
  invalid: ["invalid_contradictory"],
  fraud_suspected: ["fraud_suspected_pattern"],
} as const;

const qualityScoreByReviewStatus = {
  valid: 100,
  partial_valid: 60,
  invalid: 0,
  fraud_suspected: 0,
} as const;

const validationPreRevealForbiddenFields = [
  "probability",
  "odds",
  "currentDirection",
  "leadingOption",
  "responseRatio",
  "voteCountByOption",
  "rawVoteCount",
  "internalSampleDistribution",
  "unrevealedResultTrend",
  "traderSentiment",
  "optionVolume",
  "trend",
  "marketPrice",
] as const;

const adjudicationForbiddenFields = [
  "odds",
  "optionVolume",
  "currentDirection",
  "traderSentiment",
  "validationLayerHeat",
] as const;

const INTERNAL_IDENTITY_KEYS = [
  "userId",
  "createdByUserId",
  "updatedByUserId",
  "reviewedByUserId",
] as const;

const createQueueOverviewSnapshot = (input: {
  schedulerStatus?: "up" | "down";
  schedulerDetails?: string;
  schedulerPaused?: boolean;
} = {}) => ({
  status: input.schedulerStatus === "down" ? "degraded" as const : "ok" as const,
  timestamp: "2026-04-24T00:36:00.000Z",
  redis: { status: "up" as const },
  queues: [
    {
      name: "system",
      status: "up" as const,
      policy: {
        retryable: true,
        attempts: 5,
        backoffType: "exponential" as const,
        backoffDelayMs: 1000,
      },
      paused: false,
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
      },
    },
    {
      name: "auth",
      status: "up" as const,
      policy: {
        retryable: false,
        attempts: 1,
      },
      paused: false,
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
      },
    },
    {
      name: "scheduler",
      status: input.schedulerStatus ?? ("up" as const),
      policy: {
        retryable: true,
        attempts: 5,
        backoffType: "exponential" as const,
        backoffDelayMs: 1000,
      },
      paused: input.schedulerPaused ?? false,
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
      },
      details: input.schedulerDetails,
    },
  ],
});

const assertForbiddenFieldsAbsent = (
  payload: Record<string, unknown> | null | undefined,
  fields: readonly string[],
) => {
  for (const field of fields) {
    assert.equal(field in (payload ?? {}), false, `expected field ${field} to be absent`);
  }
};

const assertKeyAbsentRecursively = (
  value: unknown,
  key: string,
  path = "$",
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertKeyAbsentRecursively(item, key, `${path}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(record, key),
    false,
    `${path} unexpectedly exposes ${key}`,
  );

  for (const [childKey, nested] of Object.entries(record)) {
    assertKeyAbsentRecursively(nested, key, `${path}.${childKey}`);
  }
};

const assertInternalIdentityAbsentRecursively = (value: unknown): void => {
  for (const key of INTERNAL_IDENTITY_KEYS) {
    assertKeyAbsentRecursively(value, key);
  }
};

async function createReviewedResponseForProposition(
  harness: ArenaHarness,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
    reviewStatus: "valid" | "partial_valid" | "invalid" | "fraud_suspected";
    flags?: string[];
    reasonCodes?: string[];
  },
) {
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: input.propositionId,
    userIds: [input.userId],
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 10),
  });

  const response = await harness.responseService.submitResponse({
    propositionId: input.propositionId,
    taskId: task.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(input.minuteOffset, 10),
    clientSubmittedAt: arenaTime(input.minuteOffset, 20),
    understandingAck: true,
    submittedAt: arenaTime(input.minuteOffset, 20),
  });

  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: input.reviewStatus,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: qualityScoreByReviewStatus[input.reviewStatus],
    flags: [...(input.flags ?? [])],
    reasonCodes: [
      ...(input.reasonCodes ?? defaultReasonCodesByStatus[input.reviewStatus]),
    ],
  });

  return response;
}

const createHttpArenaApp = async (): Promise<HttpArenaContext> => {
  const harness = createArenaHarness();
  const adjudicationViews = new AdjudicationViewService(
    harness.propositionRepository as any,
    harness.dispatchTaskRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
    harness.rewardLedgerRepository as any,
  );
  const validationViews = new ValidationViewService(
    harness.config as any,
    harness.propositionRepository as any,
    harness.counterRepository as any,
    harness.marketRepository as any,
    harness.betRepository as any,
  );
  const resultViews = new ResultViewService(
    harness.propositionRepository as any,
    harness.counterRepository as any,
    harness.rewardLedgerService as any,
    harness.marketRepository as any,
    harness.betRepository as any,
  );
  const rewardViews = new RewardViewService(
    harness.propositionRepository as any,
    harness.rewardLedgerService as any,
  );
  const publicResultViews = new PublicResultViewService(
    harness.propositionRepository as any,
    harness.marketRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
  );
  const publicIntegrityViews = new PublicIntegrityViewService(
    harness.propositionRepository as any,
    harness.counterService as any,
    publicResultViews as any,
  );
  const publicRespondentLeaderboard = new PublicRespondentLeaderboardService(
    harness.propositionRepository as any,
    harness.dispatchTaskRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
    harness.userReputationRepository as any,
    harness.userTagRepository as any,
    harness.accountPreferencesService as any,
    harness.systemKeyValueRepository as any,
    harness.userRepository as any,
  );
  const validationBetExecution = {
    prepare: async (input: {
      propositionId: string;
      marketId: string;
      userId: string;
      chainId: number;
      selectedOption: 0 | 1;
      stakeAmount: string;
      placedAt: string;
    }) => {
      await harness.betService.placeBet({
        ...input,
        id: "__http_prepare_probe__",
      });

      throw new Error("validationBetExecution.prepare probe should not succeed in current HTTP mapping tests");
    },
    confirm: async () => {
      throw new Error("validationBetExecution.confirm is not configured in current HTTP mapping tests");
    },
  } as unknown as ValidationBetExecutionService;
  const internalMonitoring = {
    async listSampleShortage() {
      return [];
    },
    async listQualityAnomalies() {
      return [];
    },
    async listValidationLifecycleDrift() {
      return [];
    },
    async getValidationChainHealth() {
      return {
        streamKey: VALIDATION_CHAIN_STREAM_KEY,
        chainId: 1337,
        contractAddress: "0xvalidationcontract",
        syncStatus: "idle",
        lastProcessedBlock: 118,
        lastProcessedTxHash: "0x10",
        lastProcessedLogIndex: 0,
        lastFinalizedBlock: 118,
        cursorUpdatedAt: "2026-04-24T00:35:00.000Z",
        pollIntervalMs: 15000,
        cursorStaleThresholdMs: 60000,
        isCursorStalled: false,
        schedulerWorker: null,
        recentAlerts: [],
        metrics: {
          recentRetryExhaustedCount: 0,
          recentTerminalCommandCount: 0,
          recentSyncFailureCount: 0,
          recentProjectorEntityMissingCount: 0,
          stalePayoutMarketCount: 0,
          unsyncedBetBacklogCount: 0,
        },
        eventLedger: {
          totalEventCount: 0,
          duplicateRows: [],
          recentEvents: [],
        },
        projection: {
          latestMarket: null,
          latestBet: null,
          unsyncedBetBacklog: [],
        },
        failures: {
          projectorFailuresCount: 0,
          syncFailuresCount: 0,
          recentFailures: [],
        },
        stalePayoutMarkets: [],
      };
    },
    async getValidationChainRuntimeReadiness() {
      return {
        status: "ok",
        checkedAt: "2026-04-24T00:36:00.000Z",
        validationEnvironment: "local",
        chainId: 1337,
        rpcUrl: "http://127.0.0.1:8545",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        dependencies: [
          { name: "env", status: "up" },
          { name: "database", status: "up" },
          { name: "redis", status: "up" },
          { name: "rpc", status: "up" },
          { name: "arena_artifact", status: "up" },
          { name: "validation_artifact", status: "up" },
          { name: "validation_contract", status: "up" },
          { name: "validation_contract_code", status: "up" },
          { name: "validation_contract_bytecode", status: "up" },
          { name: "validation_operator_signer", status: "up" },
          { name: "validation_oracle_signer", status: "up" },
          { name: "validation_pauser_signer", status: "up" },
        ],
        requiredEnvKeys: ["DATABASE_URL", "REDIS_URL", "RPC_URL"],
        optionalEnvKeys: ["ARENA_VALIDATION_OPERATOR_ADDRESS"],
        preflightCommands: ["pnpm run validation:env:check"],
        runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
        operatorActions: [],
      };
    },
  };
  const accountViews = new AccountViewService(
    rewardViews,
    harness.reputationService as any,
    harness.tagService as any,
    resultViews,
  );
  const logger: Pick<PinoLogger, "setContext" | "warn" | "error"> = {
    setContext() {},
    warn() {},
    error() {},
  };
  const validationChainCommands = {
    async createMarket(input?: { propositionId?: string }) {
      return {
        propositionId: input?.propositionId ?? "stub",
        marketId: "market_1",
        chainPropositionId: `chain_prop_${input?.propositionId ?? "stub"}`,
        chainMarketId: "chain_market_market_1",
        txHash: "0x1",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
      };
    },
    async openMarket() {
      throw new ValidationChainContractError(
        "openMarket",
        "timeout while opening market",
      );
    },
    async freezeMarket(input?: { propositionId?: string }) {
      return {
        propositionId: input?.propositionId ?? "stub",
        marketId: "market_1",
        chainPropositionId: `chain_prop_${input?.propositionId ?? "stub"}`,
        chainMarketId: "chain_market_market_1",
        txHash: "0x2",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
      };
    },
    async cancelMarket() {
      return {
        propositionId: "stub",
        marketId: "stub",
        chainPropositionId: "stub",
        chainMarketId: "stub",
        txHash: "0x3",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
      };
    },
  };
  const validationChainOracle = {
    async resolveMarket(input?: { propositionId?: string }) {
      return {
        propositionId: input?.propositionId ?? "stub",
        marketId: "market_1",
        chainPropositionId: `chain_prop_${input?.propositionId ?? "stub"}`,
        chainMarketId: "chain_market_market_1",
        txHash: "0x4",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
      };
    },
  };
  const validationChainPauser = {
    async pauseValidationChain() {
      return {
        txHash: "0x5",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
        contractAddress: "0xvalidationcontract",
      };
    },
    async unpauseValidationChain() {
      return {
        txHash: "0x6",
        attemptedAt: "2026-04-18T10:00:00.000Z",
        retryable: false,
        contractAddress: "0xvalidationcontract",
      };
    },
  };
  const validationChainManualSync = {
    async syncNow() {
      return {
        streamKey: VALIDATION_CHAIN_STREAM_KEY,
        latestBlock: 120,
        safeToBlock: 118,
        processedEvents: 4,
        fromBlock: 101,
        toBlock: 118,
      };
    },
  };
  const validationChainBetReconciliation = {
    async reconcileBet(input?: { marketId?: string; userId?: string }) {
      const [defaultMarket] = await harness.marketRepository.list();
      const marketId = input?.marketId ?? defaultMarket?.id ?? "market_1";
      const market = await harness.marketRepository.findById(marketId);
      const propositionId = market?.propositionId ?? "prop_1";
      const userId =
        input?.userId?.toLowerCase() ??
        "0x00000000000000000000000000000000000000aa";
      const bet = await harness.betRepository.findByMarketAndUser(marketId, userId);
      const selectedOption = 1;
      const stakeAmount = "40";
      const optionMatches = (bet?.selectedOption ?? selectedOption) === selectedOption;
      const amountMatches = (bet?.stakeAmount ?? stakeAmount) === stakeAmount;

      return {
        betId: bet?.id ?? "bet_1",
        marketId,
        propositionId,
        userId,
        localBet: {
          selectedOption: bet?.selectedOption ?? 1,
          stakeAmount: bet?.stakeAmount ?? "40",
          status: bet?.status ?? "placed",
          claimed: bet?.claimed ?? false,
          chainSyncedAt: bet?.chainSyncedAt?.toISOString() ?? null,
          placedAt: bet?.placedAt?.toISOString() ?? "2026-04-24T00:20:00.000Z",
        },
        onChainPosition: {
          exists: true,
          selectedOption: 1,
          stakeAmount: "40",
          claimed: false,
          claimableAmount: "0",
        },
        comparison: {
          positionExists: true,
          optionMatches,
          amountMatches,
          claimedMatches: true,
          claimableAmount: "0",
        },
      };
    },
    async reconcileUnsyncedBets() {
      const [defaultMarket] = await harness.marketRepository.list();
      const marketId = defaultMarket?.id ?? "market_1";
      const propositionId = defaultMarket?.propositionId ?? "prop_1";

      return {
        processedAt: "2026-04-24T00:30:00.000Z",
        requestedLimit: 10,
        processedCount: 2,
        matchedCount: 1,
        mismatchedCount: 1,
        failedCount: 0,
        items: [
          {
            betId: "bet_1",
            marketId,
            propositionId,
            userId: "0x00000000000000000000000000000000000000aa",
            status: "matched",
            reconciliation: {
              betId: "bet_1",
              marketId,
              propositionId,
              userId: "0x00000000000000000000000000000000000000aa",
              localBet: {
                selectedOption: 1,
                stakeAmount: "40",
                status: "placed",
                claimed: false,
                chainSyncedAt: null,
                placedAt: "2026-04-24T00:20:00.000Z",
              },
              onChainPosition: {
                exists: true,
                selectedOption: 1,
                stakeAmount: "40",
                claimed: false,
                claimableAmount: "0",
              },
              comparison: {
                positionExists: true,
                optionMatches: true,
                amountMatches: true,
                claimedMatches: true,
                claimableAmount: "0",
              },
            },
            errorCode: null,
            errorMessage: null,
          },
          {
            betId: "bet_2",
            marketId,
            propositionId,
            userId: "0x00000000000000000000000000000000000000bb",
            status: "mismatched",
            reconciliation: {
              betId: "bet_2",
              marketId,
              propositionId,
              userId: "0x00000000000000000000000000000000000000bb",
              localBet: {
                selectedOption: 1,
                stakeAmount: "25",
                status: "placed",
                claimed: false,
                chainSyncedAt: null,
                placedAt: "2026-04-24T00:21:00.000Z",
              },
              onChainPosition: {
                exists: true,
                selectedOption: 0,
                stakeAmount: "15",
                claimed: false,
                claimableAmount: "3",
              },
              comparison: {
                positionExists: true,
                optionMatches: false,
                amountMatches: false,
                claimedMatches: true,
                claimableAmount: "3",
              },
            },
            errorCode: null,
            errorMessage: null,
          },
        ],
      };
    },
  };
  const validationChainProjectionReplay = {
    async replayMarketProjection(input?: { marketId?: string }) {
      const marketId = input?.marketId ?? "market_1";
      const market = await harness.marketRepository.findById(marketId);
      const propositionId = market?.propositionId ?? "prop_1";
      const chainMarketId = market?.chainMarketId ?? `chain_market_${marketId}`;
      const chainPropositionId =
        market?.chainPropositionId ?? `chain_prop_${propositionId}`;

      return {
        marketId,
        propositionId,
        chainMarketId,
        chainPropositionId,
        processedAt: "2026-04-24T00:35:00.000Z",
        replayedEventCount: 3,
        replayedEvents: [
          {
            eventName: "MarketCreated",
            blockNumber: 10,
            transactionHash: "0x10",
            transactionIndex: 0,
            logIndex: 0,
            marketChainId: chainMarketId,
            propositionChainId: chainPropositionId,
            processedAt: "2026-04-24T00:10:00.000Z",
          },
        ],
        propositionStatus: "settled",
        propositionSettledAt: "2026-04-24T00:35:00.000Z",
        finalMarketProjection: {
          chainStatus: "resolved",
          chainOpenedAt: "2026-04-24T00:20:00.000Z",
          chainFrozenAt: null,
          chainResolvedAt: "2026-04-24T00:30:00.000Z",
          chainCancelledAt: null,
          chainResultKind: "resolved",
          chainWinningOption: 1,
          chainVoidReason: null,
          resolutionTxHash: "0x12",
          cancelTxHash: null,
          chainSyncedAt: "2026-04-24T00:30:00.000Z",
        },
        finalBetProjections: [
          {
            betId: "bet_1",
            marketId,
            propositionId,
            userId: "0x00000000000000000000000000000000000000aa",
            status: "settled",
            claimed: true,
            settlementOutcome: "won",
            grossPayout: "40",
            refundAmount: null,
            claimTxHash: "0x13",
            refundTxHash: null,
            chainSyncedAt: "2026-04-24T00:31:00.000Z",
          },
        ],
      };
    },
  };
  const validationChainCommandRecovery = {
    async recoverQueuedCommands() {
      return {
        propositionId: "prop_1",
        marketId: "market_1",
        chainMarketId: "chain_market_1",
        chainPropositionId: "chain_prop_1",
        queuedAt: "2026-04-24T00:36:00.000Z",
        requestStatus: "queued",
        propositionStatus: "revealing",
        marketStatus: "frozen_for_reveal",
        localChainStatus: "live",
        onChainState: "live",
        driftReason: "chain_market_not_frozen",
        recoveryReason: "freeze_resolve_live_market",
        plannedCommands: ["freeze_market", "resolve_market"],
        commandSubmissions: [
          {
            command: "freeze_market",
            status: "enqueued",
            queueJobId: "validation-chain.freeze_market.prop_1",
            delayMs: 0,
            errorMessage: null,
          },
          {
            command: "resolve_market",
            status: "enqueued",
            queueJobId: "validation-chain.resolve_market.prop_1",
            delayMs: 5000,
            errorMessage: null,
          },
        ],
      };
    },
  };
  const healthPrisma = {
    async assertReady() {},
  };
  const healthRedis = {
    async ping() {},
  };
  const healthBlockchain = {
    async assertReady() {},
  };
  const healthQueue = {
    async getQueueOverview() {
      return createQueueOverviewSnapshot();
    },
  };

  @Module({
    controllers: [
      HealthController,
      SystemController,
      ArenaInternalDiscoveryConfigController,
      ArenaInternalDispatchController,
      ArenaInternalPropositionsController,
      ArenaInternalRewardsController,
      ArenaInternalResponsesController,
      ArenaInternalMonitoringController,
      ArenaInternalValidationChainController,
      ArenaPropositionsController,
      ArenaAdjudicationController,
      ArenaRespondentAccountController,
      ArenaRespondentResultsController,
      ArenaValidationController,
      ArenaPublicController,
      ArenaPublicDiscoveryController,
      ArenaPublicRespondentLeaderboardController,
      TestErrorController,
    ],
    providers: [
      { provide: PinoLogger, useValue: logger },
      { provide: PrismaService, useValue: healthPrisma },
      { provide: RedisService, useValue: healthRedis },
      { provide: BlockchainService, useValue: healthBlockchain },
      { provide: AppQueueService, useValue: healthQueue },
      HealthService,
      { provide: DispatchEngineService, useValue: harness.dispatchEngineService },
      { provide: InternalPropositionOpsService, useValue: harness.internalPropositionOpsService },
      {
        provide: InternalResponseReviewOpsService,
        useValue: harness.internalResponseReviewOpsService,
      },
      {
        provide: InternalRewardAuditService,
        useValue: harness.internalRewardAuditService,
      },
      { provide: InternalMonitoringService, useValue: internalMonitoring },
      { provide: QualityEngineService, useValue: harness.qualityEngineService },
      {
        provide: ValidationChainOperatorCommandService,
        useValue: validationChainCommands,
      },
      {
        provide: ValidationChainOracleService,
        useValue: validationChainOracle,
      },
      {
        provide: ValidationChainPauserService,
        useValue: validationChainPauser,
      },
      {
        provide: ValidationChainManualSyncService,
        useValue: validationChainManualSync,
      },
      {
        provide: ValidationChainBetReconciliationService,
        useValue: validationChainBetReconciliation,
      },
      {
        provide: ValidationChainProjectionReplayService,
        useValue: validationChainProjectionReplay,
      },
      {
        provide: ValidationChainCommandRecoveryService,
        useValue: validationChainCommandRecovery,
      },
      {
        provide: ValidationProofRecordService,
        useValue: {
          async getLatestRecord() {
            return null;
          },
          async recordProof() {
            return null;
          },
        },
      },
      {
        provide: ValidationRehearsalCheckpointService,
        useValue: harness.validationRehearsalCheckpointService,
      },
      { provide: PropositionDraftService, useValue: harness.propositionDraftService },
      {
        provide: RequesterPropositionViewService,
        useValue: harness.requesterPropositionViewService,
      },
      {
        provide: RequesterReportPresetService,
        useValue: harness.requesterReportPresetService,
      },
      {
        provide: RequesterComparisonSetService,
        useValue: harness.requesterComparisonSetService,
      },
      {
        provide: RequesterComparisonSetDeliveryPolicyService,
        useValue: harness.requesterComparisonSetDeliveryPolicyService,
      },
      {
        provide: RequesterComparisonSetDeliveryTransportService,
        useValue: harness.requesterComparisonSetDeliveryTransportService,
      },
      { provide: ResponseService, useValue: harness.responseService },
      { provide: EffectiveSampleCounterService, useValue: harness.counterService },
      { provide: BetService, useValue: harness.betService },
      { provide: ValidationBetExecutionService, useValue: validationBetExecution },
      { provide: AdjudicationViewService, useValue: adjudicationViews },
      { provide: AccountViewService, useValue: accountViews },
      { provide: AccountExportService, useValue: harness.accountExportService },
      { provide: AccountPreferencesService, useValue: harness.accountPreferencesService },
      { provide: WatchlistService, useValue: harness.watchlistService },
      { provide: ResultViewService, useValue: resultViews },
      { provide: PublicResultViewService, useValue: publicResultViews },
      { provide: PublicIntegrityViewService, useValue: publicIntegrityViews },
      { provide: PublicDiscoveryService, useValue: new PublicDiscoveryService(validationViews as any) },
      { provide: ArenaIdService, useValue: new ArenaIdService() },
      { provide: SystemKeyValueRepository, useValue: harness.systemKeyValueRepository },
      {
        provide: DiscoveryConfigService,
        useFactory: (
          ids: ArenaIdService,
          systemKeyValues: SystemKeyValueRepository,
          views: ValidationViewService,
        ) => new DiscoveryConfigService(ids, systemKeyValues, views),
        inject: [ArenaIdService, SystemKeyValueRepository, ValidationViewService],
      },
      {
        provide: PublicRespondentLeaderboardService,
        useValue: publicRespondentLeaderboard,
      },
      { provide: ValidationViewService, useValue: validationViews },
      {
        provide: APP_GUARD,
        useClass: ArenaSurfaceBoundaryGuard,
      },
      {
        provide: APP_GUARD,
        useClass: TestAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
      },
      {
        provide: APP_FILTER,
        useClass: ApiExceptionFilter,
      },
    ],
  })
  class TestArenaHttpModule {}

  const app = await NestFactory.create(TestArenaHttpModule, {
    logger: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  const port =
    typeof address === "object" && address !== null ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to resolve HTTP test port");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    harness,
  };
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const context = await createHttpArenaApp();

  try {
    await callback(context);
  } finally {
    await context.app.close();
  }
};

const createWebhookCaptureServer = async (
  deliveries: Array<{ path: string; body: any }>,
  options: {
    statusCode?: number;
    responseBody?: unknown;
    onRequest?: (input: {
      headers: Record<string, string | string[] | undefined>;
    }) => void;
  } = {},
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> => {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      options.onRequest?.({
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [key, value]),
        ),
      });
      const rawBody = Buffer.concat(chunks).toString("utf8");
      deliveries.push({
        path: request.url ?? "/",
        body: rawBody.length > 0 ? JSON.parse(rawBody) : null,
      });
      response.statusCode = options.statusCode ?? 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(options.responseBody ?? { ok: true }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to resolve webhook test port");
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
};

const requestJson = async (
  baseUrl: string,
  path: string,
  input: {
    method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
    body?: unknown;
    user?: TestUser;
  } = {},
): Promise<JsonResponse> => {
  const headers = new Headers({
    accept: "application/json",
  });

  if (input.user) {
    headers.set("x-test-user-id", input.user.userId);
    if (typeof input.user.chainId === "number") {
      headers.set("x-test-chain-id", String(input.user.chainId));
    }
    if (input.user.roles && input.user.roles.length > 0) {
      headers.set("x-test-roles", input.user.roles.join(","));
    }
  }

  const init: RequestInit = {
    method: input.method ?? "GET",
    headers,
  };

  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(input.body);
  }

  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

test("rejecting a live proposition returns 409 Conflict instead of 500", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness);

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/reject`,
      {
        method: "POST",
        user: {
          userId: "operator_1",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "smoke_test_reject",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "proposition.reject_not_allowed");
    assert.equal(
      response.body.error.message,
      "Only draft or scheduled propositions can be rejected",
    );
  });
});

test("public readiness route exposes scheduler queue as a real backend dependency", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/health/ready");

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.status, "ok");
    assert.deepEqual(
      response.body.dependencies.map((dependency: { name: string }) => dependency.name),
      ["database", "redis", "rpc", "scheduler_queue"],
    );
    assert.equal(
      response.body.dependencies.find(
        (dependency: { name: string; status: string }) =>
          dependency.name === "scheduler_queue",
      )?.status,
      "up",
    );
  });
});

test("public readiness route returns 503 when the scheduler queue is unavailable", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app.get(AppQueueService).getQueueOverview = async () =>
      createQueueOverviewSnapshot({
        schedulerStatus: "down",
        schedulerDetails: "scheduler queue worker is disconnected",
      });

    const response = await requestJson(baseUrl, "/health/ready");

    assert.equal(response.status, HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "DEPENDENCY_UNAVAILABLE");
    assert.equal(response.body.error.message, "Service readiness check failed");
    assert.equal(response.body.error.details.status, "degraded");
    assert.equal(
      response.body.error.details.dependencies.find(
        (dependency: { name: string }) => dependency.name === "scheduler_queue",
      )?.status,
      "down",
    );
    assert.equal(
      response.body.error.details.dependencies.find(
        (dependency: { name: string }) => dependency.name === "scheduler_queue",
      )?.details,
      "scheduler queue worker is disconnected",
    );
  });
});

test("submitting a response after freeze returns 409 Conflict instead of 500", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness);
    const task = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "user_submit_after_freeze",
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

    await harness.propositionService.freeze({
      propositionId: proposition.id,
      frozenAt: "2026-04-18T10:08:00.000Z",
      updatedByUserId: "admin_1",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${task.id}/responses`,
      {
        method: "POST",
        user: {
          userId: "user_submit_after_freeze",
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 0,
          confirmationOption: 0,
          clientStartedAt: "2026-04-18T10:08:10.000Z",
          clientSubmittedAt: "2026-04-18T10:08:20.000Z",
          understandingAck: true,
          submittedAt: "2026-04-18T10:08:20.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "response.proposition_not_live");
    assert.equal(
      response.body.error.message,
      "Responses can only be submitted while the proposition is live",
    );
  });
});

test("placing a bet after freeze returns 409 Conflict instead of 500", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    await harness.propositionService.freeze({
      propositionId: proposition.id,
      frozenAt: "2026-04-18T10:08:00.000Z",
      updatedByUserId: "admin_1",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/validation/markets/${market.id}/bets/prepare`,
      {
        method: "POST",
        user: {
          userId: "bettor_after_freeze",
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 0,
          stakeAmount: "20",
          placedAt: "2026-04-18T10:08:30.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "bet.market_not_live");
    assert.equal(
      response.body.error.message,
      "Bets can only be placed while the market and proposition are live",
    );
  });
});

test("placing a bet with a mismatched authenticated chain returns 409 Conflict", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    const response = await requestJson(
      baseUrl,
      `/arena/validation/markets/${market.id}/bets/prepare`,
      {
        method: "POST",
        user: {
          userId: "bettor_wrong_chain",
          chainId: 31337,
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 0,
          stakeAmount: "20",
          placedAt: "2026-04-18T10:08:30.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "bet.chain_id_mismatch");
    assert.equal(
      response.body.error.message,
      "Bets can only be recorded for the configured validation chain",
    );
  });
});

test("confirming a validation bet before the transaction is confirmed returns 409 Conflict", async () => {
  await withHttpArenaApp(async ({ app, baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    app.get(ValidationBetExecutionService).confirm = async () => {
      throw new ArenaValidationError(
        "bet.transaction_not_confirmed",
        "The submitted transaction has not been confirmed successfully on chain",
      );
    };

    const response = await requestJson(
      baseUrl,
      `/arena/validation/markets/${market.id}/bets/confirm`,
      {
        method: "POST",
        user: {
          userId: "bettor_pending_receipt",
          chainId: 1,
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 0,
          stakeAmount: "20",
          placedAt: "2026-04-18T10:08:30.000Z",
          txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "bet.transaction_not_confirmed");
    assert.equal(
      response.body.error.message,
      "The submitted transaction has not been confirmed successfully on chain",
    );
  });
});

test("confirming a validation bet with a mismatched receipt returns 409 Conflict", async () => {
  await withHttpArenaApp(async ({ app, baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    app.get(ValidationBetExecutionService).confirm = async () => {
      throw new ArenaValidationError(
        "bet.transaction_mismatch",
        "The submitted transaction did not produce a matching validation-chain BetPlaced event",
      );
    };

    const response = await requestJson(
      baseUrl,
      `/arena/validation/markets/${market.id}/bets/confirm`,
      {
        method: "POST",
        user: {
          userId: "bettor_mismatched_receipt",
          chainId: 1,
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 0,
          stakeAmount: "20",
          placedAt: "2026-04-18T10:08:30.000Z",
          txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "bet.transaction_mismatch");
    assert.equal(
      response.body.error.message,
      "The submitted transaction did not produce a matching validation-chain BetPlaced event",
    );
  });
});

test("arena not found errors are mapped to 404", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/public/propositions/missing-proposition/progress",
    );

    assert.equal(response.status, HttpStatus.NOT_FOUND);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "proposition.not_found");
    assert.equal(
      response.body.error.message,
      "Proposition missing-proposition was not found",
    );
  });
});

test("public market search route returns filtered public market results", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Transit support search proposition",
      category: "politics",
      options: ["Support", "Oppose"],
    });
    await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Stadium atmosphere check",
      category: "sports",
      options: ["Loud", "Muted"],
    });

    const response = await requestJson(
      baseUrl,
      "/arena/public/markets/search?q=transit",
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(Array.isArray(response.body), true);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0]?.title, "Transit support search proposition");
    assert.equal(response.body[0]?.category, "politics");
    assert.equal("marketBias" in (response.body[0] ?? {}), false);
  });
});

test("public and validation market routes keep pre-reveal progress visible without leaking directional fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      minEffectiveSample: 2,
      title: "HTTP boundary market proposition",
      category: "politics",
    });

    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId: "http_boundary_user_a",
      minuteOffset: 620,
      reviewStatus: "valid",
    });
    await harness.counterService.rebuildCounterForProposition(proposition.id);

    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    const publicListResponse = await requestJson(baseUrl, "/arena/public/markets");
    const publicDetailResponse = await requestJson(
      baseUrl,
      `/arena/public/markets/${market.id}`,
    );
    const validationListResponse = await requestJson(
      baseUrl,
      "/arena/validation/markets",
      {
        user: {
          userId: "validation_http_boundary_user",
          roles: [SystemRole.User],
          chainId: 1,
        },
      },
    );
    const validationDetailResponse = await requestJson(
      baseUrl,
      `/arena/validation/markets/${market.id}`,
      {
        user: {
          userId: "validation_http_boundary_user",
          roles: [SystemRole.User],
          chainId: 1,
        },
      },
    );

    const publicListMarket = (publicListResponse.body as Array<Record<string, unknown>>).find(
      (item) => item.marketId === market.id,
    );
    const validationListMarket = (
      validationListResponse.body as Array<Record<string, unknown>>
    ).find((item) => item.marketId === market.id);

    assert.equal(publicListResponse.status, HttpStatus.OK);
    assert.equal(publicDetailResponse.status, HttpStatus.OK);
    assert.equal(validationListResponse.status, HttpStatus.OK);
    assert.equal(validationDetailResponse.status, HttpStatus.OK);

    for (const view of [
      publicListMarket,
      publicDetailResponse.body,
      validationListMarket,
      validationDetailResponse.body,
    ]) {
      assert.ok(view);
      assert.equal(typeof view.timeProgressPercent, "number");
      assert.equal(typeof (view.publicProgress as { progress?: unknown })?.progress, "object");
      assert.equal(
        typeof (
          view.publicProgress as {
            progress?: { currentEffectiveSample?: unknown };
          }
        )?.progress?.currentEffectiveSample,
        "number",
      );
      assertForbiddenFieldsAbsent(view, validationPreRevealForbiddenFields);
      assertInternalIdentityAbsentRecursively(view);
    }

    assert.equal(publicDetailResponse.body.publicProgress.progress.totalRequired, 2);
    assert.equal(publicDetailResponse.body.publicProgress.progress.progressPercent, 50);
    assert.equal(
      validationDetailResponse.body.publicProgress.progress.currentEffectiveSample,
      1,
    );
  });
});

test("public integrity overview route supports proposition-scoped focus without exposing internal monitoring detail", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      minEffectiveSample: 2,
      title: "HTTP integrity focus proposition",
      category: "politics",
    });

    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId: "http_integrity_focus_user",
      minuteOffset: 710,
      reviewStatus: "valid",
    });
    await harness.counterService.rebuildCounterForProposition(proposition.id);

    const response = await requestJson(
      baseUrl,
      `/arena/public/integrity/overview?propositionId=${proposition.id}`,
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(typeof response.body.generatedAt, "string");
    assert.equal(response.body.focus.propositionId, proposition.id);
    assert.equal(response.body.focus.visible, true);
    assert.equal(response.body.focus.source, "live");
    assert.equal(response.body.focus.liveItem.propositionId, proposition.id);
    assert.equal(response.body.focus.archiveItem, null);
    assert.equal("reviewedResponses" in (response.body.focus.liveItem ?? {}), false);
    assert.equal("flags" in (response.body.focus.liveItem ?? {}), false);
    assert.equal("operatorActions" in response.body, false);
  });
});

test("public discovery closing-soon route returns urgent and upcoming public market buckets", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const now = new Date();
    const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    const createRecentLiveProposition = async (input: {
      title: string;
      category: "politics" | "sports" | "ai" | "general";
      maxDurationSeconds: number;
      liveOffsetMs: number;
    }) => {
      const draft = await harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        title: input.title,
        category: input.category,
        marketEnabled: true,
        minDurationSeconds: 300,
        maxDurationSeconds: input.maxDurationSeconds,
      });
      const scheduled =
        await harness.propositionEngineService.approveOrScheduleProposition({
          propositionId: draft.id,
          publishedAt,
          updatedByUserId: "admin_1",
        });

      return harness.propositionEngineService.publishLiveProposition({
        propositionId: scheduled.id,
        liveAt: new Date(now.getTime() + input.liveOffsetMs).toISOString(),
        updatedByUserId: "admin_1",
      });
    };

    await createRecentLiveProposition({
      title: "Route urgent proposition",
      category: "politics",
      maxDurationSeconds: 2 * 60 * 60,
      liveOffsetMs: -30 * 60 * 1000,
    });
    await createRecentLiveProposition({
      title: "Route upcoming proposition",
      category: "ai",
      maxDurationSeconds: 8 * 60 * 60,
      liveOffsetMs: 0,
    });

    const response = await requestJson(
      baseUrl,
      "/arena/public/discovery/closing-soon",
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(typeof response.body.generatedAt, "string");
    assert.equal(response.body.urgentWindowMs, 3 * 60 * 60 * 1000);
    assert.equal(Array.isArray(response.body.urgent), true);
    assert.equal(Array.isArray(response.body.upcoming), true);
    assert.equal(response.body.urgent.length >= 1, true);
    assert.equal(response.body.upcoming.length >= 1, true);
    assert.equal(response.body.urgent[0]?.differenceMs > 0, true);
    assert.equal(
      response.body.upcoming.every(
        (item: { differenceMs: number }) =>
          item.differenceMs > response.body.urgentWindowMs,
      ),
      true,
    );
  });
});

test("public discovery category index route returns the real directory slug and pathname list", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/public/discovery/categories",
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(Array.isArray(response.body.items), true);
    assert.equal(
      response.body.items.some(
        (item: {
          slug: string;
          pathname: string;
          label: string;
          title: string;
          directoryLabel: string;
          description: string;
        }) =>
          item.slug === "politics" &&
          item.pathname === "/zh/politics" &&
          item.label === "公共政策" &&
          item.title === "政治" &&
          item.directoryLabel === "公共政策" &&
          item.description === "政府、立法与公共治理",
      ),
      true,
    );
    assert.equal(
      response.body.items.some(
        (item: { slug: string; pathname: string; label: string; directoryLabel: string }) =>
          item.slug === "sports-live" &&
          item.pathname === "/zh/sports/live" &&
          item.label === "体育" &&
          item.directoryLabel === "体育结果",
      ),
      true,
    );
    assertInternalIdentityAbsentRecursively(response.body);
  });
});

test("public respondent leaderboard route returns only privacy-safe public aggregate rows", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Leaderboard route politics proposition",
      category: "politics",
    });
    const userId = "http_public_leaderboard_user";

    await harness.userRepository.create({
      id: userId,
      primaryWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      normalizedPrimaryWalletAddress:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "active",
    } as never);

    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId,
      minuteOffset: 610,
      reviewStatus: "valid",
    });

    const defaults = await harness.accountPreferencesService.getAccountPreferencesForUser(userId);
    await harness.accountPreferencesService.updateAccountPreferencesForUser(userId, {
      ...defaults,
      profile: {
        ...defaults.profile,
        profileVisibility: "public",
      },
      privacy: {
        ...defaults.privacy,
        allowActivityIndexing: true,
      },
    });

    const response = await requestJson(
      baseUrl,
      "/arena/public/discovery/respondent-leaderboard",
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(Array.isArray(response.body.categories), true);
    assert.equal(
      response.body.categories.some((category: { id: string; rows: Array<{ walletShort: string; handle: string; userId?: string }> }) =>
        category.id === "public-policy" &&
        category.rows.some((row) => row.walletShort === "0xaaaa…aaaa" && row.handle === "respondent-aaaa" && row.userId === undefined),
      ),
      true,
    );
    assertInternalIdentityAbsentRecursively(response.body);
  });
});

test("dto validation failures still return 400 Bad Request", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness);
    const task = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "user_invalid_payload",
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${task.id}/responses`,
      {
        method: "POST",
        user: {
          userId: "user_invalid_payload",
          roles: [SystemRole.User],
        },
        body: {
          propositionId: proposition.id,
          selectedOption: 2,
          confirmationOption: 0,
          clientStartedAt: "2026-04-18T10:06:10.000Z",
          clientSubmittedAt: "2026-04-18T10:06:20.000Z",
          understandingAck: true,
          submittedAt: "2026-04-18T10:06:20.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed");
  });
});

test("missing authentication still returns 401", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/arena/adjudication/tasks");

    assert.equal(response.status, HttpStatus.UNAUTHORIZED);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
    assert.equal(response.body.error.message, "Authentication required");
  });
});

test("result summary for an unsettled proposition returns 409 Conflict", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness);

    const response = await requestJson(
      baseUrl,
      `/arena/adjudication/results/${proposition.id}`,
      {
        user: {
          userId: "result_reader_http",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "result.summary_not_available");
    assert.equal(
      response.body.error.message,
      `Result summary for proposition ${proposition.id} is not available while status is live.`,
    );
  });
});

test("result list still requires authentication", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/arena/adjudication/results");

    assert.equal(response.status, HttpStatus.UNAUTHORIZED);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
    assert.equal(response.body.error.message, "Authentication required");
  });
});

test("result overview still requires authentication", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/adjudication/results/overview",
    );

    assert.equal(response.status, HttpStatus.UNAUTHORIZED);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
    assert.equal(response.body.error.message, "Authentication required");
  });
});

test("account overview still requires authentication", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/adjudication/account/overview",
    );

    assert.equal(response.status, HttpStatus.UNAUTHORIZED);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
    assert.equal(response.body.error.message, "Authentication required");
  });
});

test("account exports still require authentication", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/adjudication/account/exports",
    );

    assert.equal(response.status, HttpStatus.UNAUTHORIZED);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
    assert.equal(response.body.error.message, "Authentication required");
  });
});

test("account export endpoints create and list real export records", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    await harness.userIdentityService.ensureUserExists("export_http_user");
    await harness.userRepository.updatePrimaryWalletAddress(
      "export_http_user",
      "0x1234567890abcdef1234567890abcdef1234abcd",
    );

    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "HTTP export proposition",
      category: "ai",
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    await harness.betService.placeBet({
      propositionId: proposition.id,
      marketId: market.id,
      userId: "export_http_user",
      selectedOption: 0,
      stakeAmount: "25",
      placedAt: "2026-04-18T10:06:00.000Z",
    });

    await requestJson(baseUrl, "/arena/adjudication/account/preferences", {
      method: "PATCH",
      user: {
        userId: "export_http_user",
        roles: [SystemRole.User],
      },
      body: {
        notificationPreferences: {
          emailSettlement: false,
          emailWatchlistUpdate: true,
          emailSecurityAlert: true,
          appOrderFilled: true,
          appSettlement: true,
          appWatchlistUpdate: true,
          reviewSubmissionReceived: true,
          reviewNeedMoreInfo: true,
          reviewDecision: true,
          challengeProgress: true,
          dailyDigest: false,
          quietHours: false,
          onlyImportant: false,
          syncEmailAndApp: true,
        },
        profile: {
          avatarStyle: "initial",
          landingView: "overview",
          profileVisibility: "members",
        },
        privacy: {
          showAccountSummary: true,
          showSettledHistory: false,
          allowActivityIndexing: false,
        },
        security: {
          twoFactorEnabled: false,
          withdrawalConfirmEnabled: true,
        },
        devices: {
          rememberTrustedDevice: true,
          sessionAlertsEnabled: true,
        },
        wallet: {
          walletConnected: true,
          signingReminderEnabled: true,
          metricView: "usdc",
          timeDisplay: "absolute",
          highlightSettlement: true,
          hideSmallFills: true,
        },
        exports: {
          period: "90d",
          includeSettlementAttachment: true,
          maskWalletAddress: true,
        },
        developer: {
          keyCreated: false,
          whitelistEnabled: false,
          environment: "sandbox",
          codeEnabled: false,
          scope: "self",
        },
      },
    });

    const createResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/exports",
      {
        method: "POST",
        user: {
          userId: "export_http_user",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(createResponse.body);
    assert.equal(createResponse.body.status, "completed");
    assert.equal(createResponse.body.format, "json");
    assert.equal(createResponse.body.period, "90d");
    assert.equal(createResponse.body.fileName.endsWith(".json"), true);
    assert.equal(createResponse.body.walletAddress, "0x1234...abcd");

    const listResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/exports",
      {
        user: {
          userId: "export_http_user",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.items[0].exportId, createResponse.body.exportId);
    assert.equal(listResponse.body.items[0].metrics.openPositionCount, 1);
  });
});

test("adjudication task routes keep public progress while hiding market-direction and sentiment fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      minEffectiveSample: 2,
      title: "HTTP adjudication boundary proposition",
      category: "sports",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["adjudication_http_boundary_user"],
      assignedAt: arenaTime(640),
      expiresAt: arenaTime(650),
    });

    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId: "adjudication_counter_user",
      minuteOffset: 641,
      reviewStatus: "partial_valid",
    });
    await harness.counterService.rebuildCounterForProposition(proposition.id);

    const listResponse = await requestJson(baseUrl, "/arena/adjudication/tasks", {
      user: {
        userId: "adjudication_http_boundary_user",
        roles: [SystemRole.User],
      },
    });
    const detailResponse = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${task.id}`,
      {
        user: {
          userId: "adjudication_http_boundary_user",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.status, HttpStatus.OK);

    const listTask = (listResponse.body as Array<Record<string, unknown>>)[0];
    for (const view of [listTask, detailResponse.body]) {
      assert.ok(view);
      assert.equal(typeof view.timeRemainingSeconds, "number");
      assert.equal(
        typeof (
          view.publicProgress as {
            progress?: { currentEffectiveSample?: unknown; progressPercent?: unknown };
          }
        )?.progress?.currentEffectiveSample,
        "number",
      );
      assert.equal(
        typeof (
          view.publicProgress as {
            progress?: { currentEffectiveSample?: unknown; progressPercent?: unknown };
          }
        )?.progress?.progressPercent,
        "number",
      );
      assertForbiddenFieldsAbsent(view, adjudicationForbiddenFields);
      assertForbiddenFieldsAbsent(
        view.publicProgress as Record<string, unknown>,
        ["leadingOption", "responseRatio", "rawVoteCount", "voteCountByOption"],
      );
      assertInternalIdentityAbsentRecursively(view);
    }
  });
});

test("account export detail endpoint returns the stored artifact and keeps ownership boundaries", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    await harness.userIdentityService.ensureUserExists("export_http_detail_user");
    await harness.userRepository.updatePrimaryWalletAddress(
      "export_http_detail_user",
      "0xabcdefabcdefabcdefabcdefabcdefabcdef4321",
    );

    await requestJson(baseUrl, "/arena/adjudication/account/preferences", {
      method: "PATCH",
      user: {
        userId: "export_http_detail_user",
        roles: [SystemRole.User],
      },
      body: {
        notificationPreferences: {
          emailSettlement: false,
          emailWatchlistUpdate: true,
          emailSecurityAlert: true,
          appOrderFilled: true,
          appSettlement: true,
          appWatchlistUpdate: true,
          reviewSubmissionReceived: true,
          reviewNeedMoreInfo: true,
          reviewDecision: true,
          challengeProgress: true,
          dailyDigest: false,
          quietHours: false,
          onlyImportant: false,
          syncEmailAndApp: true,
        },
        profile: {
          avatarStyle: "initial",
          landingView: "overview",
          profileVisibility: "members",
        },
        privacy: {
          showAccountSummary: true,
          showSettledHistory: false,
          allowActivityIndexing: false,
        },
        security: {
          twoFactorEnabled: false,
          withdrawalConfirmEnabled: true,
        },
        devices: {
          rememberTrustedDevice: true,
          sessionAlertsEnabled: true,
        },
        wallet: {
          walletConnected: true,
          signingReminderEnabled: true,
          metricView: "usdc",
          timeDisplay: "absolute",
          highlightSettlement: true,
          hideSmallFills: true,
        },
        exports: {
          period: "30d",
          includeSettlementAttachment: true,
          maskWalletAddress: true,
        },
        developer: {
          keyCreated: false,
          whitelistEnabled: false,
          environment: "sandbox",
          codeEnabled: false,
          scope: "self",
        },
      },
    });

    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "HTTP export detail proposition",
      category: "ai",
    });
    const market = await harness.marketRepository.findByPropositionId(proposition.id);
    assert.ok(market);

    await harness.betService.placeBet({
      propositionId: proposition.id,
      marketId: market.id,
      userId: "export_http_detail_user",
      selectedOption: 1,
      stakeAmount: "15",
      placedAt: "2026-04-18T10:16:00.000Z",
    });

    const createResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/exports",
      {
        method: "POST",
        user: {
          userId: "export_http_detail_user",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/adjudication/account/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "export_http_detail_user",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.exportId, createResponse.body.exportId);
    assert.equal(detailResponse.body.fileName, createResponse.body.fileName);
    assertInternalIdentityAbsentRecursively(detailResponse.body.overview);
    assertInternalIdentityAbsentRecursively(detailResponse.body.preferences);
    assert.equal(detailResponse.body.walletAddress, "0xabcd...4321");

    const otherUserDetailResponse = await requestJson(
      baseUrl,
      `/arena/adjudication/account/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "another_export_http_user",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(otherUserDetailResponse.body.success, false);
    assert.equal(otherUserDetailResponse.body.error.code, "account_export.not_found");
  });
});

test("creator draft endpoints create, list, read, update, and archive owned drafts", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const createResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_1",
        roles: [SystemRole.User],
      },
      body: {
        title: "Will this backend draft flow replace the placeholder shell?",
        summary:
          "Create a real creator-side proposition draft intake path that uses the existing proposition domain model and preserves the current frontend shell as a placeholder consumer.",
        optionA: "Yes",
        optionB: "No",
        category: "ai",
      },
    });

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assert.equal(createResponse.body.status, "draft");
    assert.equal(createResponse.body.submissionStatus, "draft");
    assert.equal(createResponse.body.category, "ai");
    assert.equal(createResponse.body.minEffectiveSample, 3);
    assert.equal(createResponse.body.minBetAmount, "10");
    assert.equal(createResponse.body.marketEnabled, true);

    const propositionId = createResponse.body.propositionId as string;

    const listResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      user: {
        userId: "creator_1",
        roles: [SystemRole.User],
      },
    });
    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.length, 1);
    assert.equal(listResponse.body[0].propositionId, propositionId);

    const otherUserListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/drafts",
      {
        user: {
          userId: "creator_2",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherUserListResponse.status, HttpStatus.OK);
    assert.equal(otherUserListResponse.body.length, 0);

    const getResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        user: {
          userId: "creator_1",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(getResponse.status, HttpStatus.OK);
    assert.equal(getResponse.body.optionA, "Yes");
    assert.equal(getResponse.body.optionB, "No");
    assert.equal(getResponse.body.submissionStatus, "draft");

    const otherUserGetResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        user: {
          userId: "creator_2",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherUserGetResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(otherUserGetResponse.body.error.code, "proposition.not_found");

    const updateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_1",
          roles: [SystemRole.User],
        },
        body: {
          summary:
            "The creator can now update a persisted draft through the API while the frontend shell remains unchanged and placeholder-only.",
          sampleConstraints: ["experienced_user", "wallet_signed"],
          minEffectiveSample: 7,
          marketEnabled: false,
          minBetAmount: "0",
        },
      },
    );
    assert.equal(updateResponse.status, HttpStatus.OK);
    assert.equal(updateResponse.body.summary.includes("persisted draft"), true);
    assert.deepEqual(updateResponse.body.sampleConstraints, [
      "experienced_user",
      "wallet_signed",
    ]);
    assert.equal(updateResponse.body.minEffectiveSample, 7);
    assert.equal(updateResponse.body.marketEnabled, false);
    assert.equal(updateResponse.body.minBetAmount, "0");

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_1",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deleteResponse.status, HttpStatus.OK);
    assert.equal(deleteResponse.body.propositionId, propositionId);
    assert.equal(typeof deleteResponse.body.archivedAt, "string");

    const stored = await harness.propositionRepository.findById(propositionId);
    assert.equal(stored?.status, "archived");

    const listAfterDelete = await requestJson(baseUrl, "/arena/propositions/drafts", {
      user: {
        userId: "creator_1",
        roles: [SystemRole.User],
      },
    });
    assert.equal(listAfterDelete.status, HttpStatus.OK);
    assert.equal(listAfterDelete.body.length, 0);
  });
});

test("draft endpoints return 409 when creator tries to edit a non-draft proposition", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      createdByUserId: "creator_live",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${proposition.id}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_live",
          roles: [SystemRole.User],
        },
        body: {
          title: "Updated live proposition title",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "proposition.draft_not_editable");
    assert.equal(
      response.body.error.message,
      "Only draft propositions can be updated by their creator",
    );
  });
});

test("creator can submit a draft for review and internal proposition views expose the submission queue state", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const createResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_submit",
        roles: [SystemRole.User],
      },
      body: {
        title: "Should operator review state be visible from internal proposition APIs?",
        summary:
          "Submit a creator-owned proposition draft into an operator-visible review queue without changing the frontend shell or mutating the core proposition lifecycle state yet.",
        optionA: "Visible",
        optionB: "Hidden",
        category: "general",
      },
    });
    const propositionId = createResponse.body.propositionId as string;

    const submitResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}/submit`,
      {
        method: "POST",
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
        body: {
          note: "ready_for_operator_screening",
        },
      },
    );
    assert.equal(submitResponse.status, HttpStatus.CREATED);
    assert.equal(submitResponse.body.status, "draft");
    assert.equal(submitResponse.body.submissionStatus, "submitted");
    assert.equal(typeof submitResponse.body.submittedAt, "string");

    const listSubmittedResponse = await requestJson(
      baseUrl,
      "/arena/propositions/drafts?submissionStatus=submitted",
      {
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(listSubmittedResponse.status, HttpStatus.OK);
    assert.equal(listSubmittedResponse.body.length, 1);
    assert.equal(listSubmittedResponse.body[0].submissionStatus, "submitted");

    const internalQueueResponse = await requestJson(
      baseUrl,
      "/arena/internal/propositions?status=draft&submissionStatus=submitted",
      {
        user: {
          userId: "operator_queue",
          roles: [SystemRole.Operator],
        },
      },
    );
    assert.equal(internalQueueResponse.status, HttpStatus.OK);
    assert.equal(internalQueueResponse.body.totalCount, 1);
    assert.equal(internalQueueResponse.body.items.length, 1);
    assert.equal(internalQueueResponse.body.items[0].propositionId, propositionId);
    assert.equal(internalQueueResponse.body.items[0].submissionStatus, "submitted");
    assert.equal(typeof internalQueueResponse.body.items[0].submittedAt, "string");

    const internalDetailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${propositionId}`,
      {
        user: {
          userId: "operator_queue",
          roles: [SystemRole.Operator],
        },
      },
    );
    assert.equal(internalDetailResponse.status, HttpStatus.OK);
    assert.equal(internalDetailResponse.body.proposition.status, "draft");
    assert.equal(internalDetailResponse.body.submission.status, "submitted");
    assert.equal(
      internalDetailResponse.body.submission.submissionReason,
      "creator_submitted_for_review",
    );
    assert.equal(
      internalDetailResponse.body.submission.submissionNote,
      "ready_for_operator_screening",
    );
    assert.equal(typeof internalDetailResponse.body.validationRehearsal.status, "string");
    assert.equal(Array.isArray(internalDetailResponse.body.validationRehearsal.steps), true);

    const updateAfterSubmitResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
        body: {
          title: "Should no longer be editable",
        },
      },
    );
    assert.equal(updateAfterSubmitResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      updateAfterSubmitResponse.body.error.code,
      "proposition.submitted_draft_not_editable",
    );

    const deleteAfterSubmitResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${propositionId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deleteAfterSubmitResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      deleteAfterSubmitResponse.body.error.code,
      "proposition.submitted_draft_not_deletable",
    );

    const creatorSubmissionsResponse = await requestJson(
      baseUrl,
      "/arena/propositions/submissions",
      {
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(creatorSubmissionsResponse.status, HttpStatus.OK);
    assert.equal(creatorSubmissionsResponse.body.length, 1);
    assert.equal(
      creatorSubmissionsResponse.body[0].submissionStatus,
      "submitted",
    );

    const creatorSubmissionDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/submissions/${propositionId}`,
      {
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(creatorSubmissionDetailResponse.status, HttpStatus.OK);
    assert.equal(
      creatorSubmissionDetailResponse.body.propositionId,
      propositionId,
    );
    assert.equal(
      creatorSubmissionDetailResponse.body.submissionStatus,
      "submitted",
    );

    const withdrawResponse = await requestJson(
      baseUrl,
      `/arena/propositions/submissions/${propositionId}/withdraw`,
      {
        method: "POST",
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
        body: {
          note: "need_to_revise_scope",
        },
      },
    );
    assert.equal(withdrawResponse.status, HttpStatus.CREATED);
    assert.equal(withdrawResponse.body.submissionStatus, "draft");
    assert.equal(withdrawResponse.body.submittedAt, null);

    const submissionsAfterWithdrawResponse = await requestJson(
      baseUrl,
      "/arena/propositions/submissions",
      {
        user: {
          userId: "creator_submit",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(submissionsAfterWithdrawResponse.status, HttpStatus.OK);
    assert.equal(submissionsAfterWithdrawResponse.body.length, 0);
  });
});

test("internal approve and reject endpoints return 409 when the draft was never submitted", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Not submitted",
      createdByUserId: "creator_unsubmitted_http",
    });

    const approveResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/approve`,
      {
        method: "POST",
        user: {
          userId: "operator_http",
          roles: [SystemRole.Operator],
        },
        body: {
          publishedAt: "2026-04-18T10:00:00.000Z",
          reason: "should_not_pass",
        },
      },
    );
    assert.equal(approveResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      approveResponse.body.error.code,
      "proposition.approve_requires_submission",
    );

    const rejectResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/reject`,
      {
        method: "POST",
        user: {
          userId: "operator_http",
          roles: [SystemRole.Operator],
        },
        body: {
          rejectedAt: "2026-04-18T10:01:00.000Z",
          reason: "should_not_pass",
        },
      },
    );
    assert.equal(rejectResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      rejectResponse.body.error.code,
      "proposition.reject_requires_submission",
    );
  });
});

test("withdrawing a non-pending submission returns 409 and internal review queue only shows submitted drafts", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const firstCreate = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_queue",
        roles: [SystemRole.User],
      },
      body: {
        title: "Newest submitted draft",
        summary:
          "This proposition is submitted and should appear at the top of the operator review queue because it was submitted later than the other pending draft.",
        optionA: "Top",
        optionB: "Bottom",
      },
    });
    const firstId = firstCreate.body.propositionId as string;

    await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${firstId}/submit`,
      {
        method: "POST",
        user: {
          userId: "creator_queue",
          roles: [SystemRole.User],
        },
      },
    );

    const secondCreate = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_queue",
        roles: [SystemRole.User],
      },
      body: {
        title: "Older submitted draft",
        summary:
          "This proposition is also submitted and should remain in the queue, but it should sort behind the more recent submission.",
        optionA: "Older",
        optionB: "Newer",
      },
    });
    const secondId = secondCreate.body.propositionId as string;

    await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${secondId}/submit`,
      {
        method: "POST",
        user: {
          userId: "creator_queue",
          roles: [SystemRole.User],
        },
      },
    );

    const queueResponse = await requestJson(
      baseUrl,
      "/arena/internal/propositions/review-queue",
      {
        user: {
          userId: "operator_queue_only",
          roles: [SystemRole.Operator],
        },
      },
    );
    assert.equal(queueResponse.status, HttpStatus.OK);
    assert.equal(queueResponse.body.totalCount >= 2, true);
    assert.equal(queueResponse.body.items[0].submissionStatus, "submitted");
    assert.equal(queueResponse.body.items[1].submissionStatus, "submitted");

    const draftOnlyCreate = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_queue",
        roles: [SystemRole.User],
      },
      body: {
        title: "Unsubmitted draft",
        summary:
          "This proposition remains a draft and must not leak into the operator review queue endpoint.",
        optionA: "Shown",
        optionB: "Hidden",
      },
    });
    const unsubmittedId = draftOnlyCreate.body.propositionId as string;

    const queueAfterDraftResponse = await requestJson(
      baseUrl,
      "/arena/internal/propositions/review-queue",
      {
        user: {
          userId: "operator_queue_only",
          roles: [SystemRole.Operator],
        },
      },
    );
    assert.equal(queueAfterDraftResponse.status, HttpStatus.OK);
    assert.equal(
      queueAfterDraftResponse.body.items.some(
        (item: { propositionId: string }) => item.propositionId === unsubmittedId,
      ),
      false,
    );

    const withdrawUnsubmittedResponse = await requestJson(
      baseUrl,
      `/arena/propositions/submissions/${unsubmittedId}/withdraw`,
      {
        method: "POST",
        user: {
          userId: "creator_queue",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(withdrawUnsubmittedResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      withdrawUnsubmittedResponse.body.error.code,
      "proposition.submission_not_pending",
    );
  });
});

test("internal dispatch route creates live proposition assignments for operators", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "HTTP dispatch creation proposition",
      createdByUserId: "dispatch_owner",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/dispatch`,
      {
        method: "POST",
        user: {
          userId: "operator_dispatch",
          roles: [SystemRole.Operator],
        },
        body: {
          userIds: ["dispatch_user_a", "dispatch_user_b"],
          assignedAt: "2026-04-18T10:06:00.000Z",
          expiresAt: "2026-04-18T10:16:00.000Z",
          maxAssignments: 1,
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(Array.isArray(response.body), true);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].propositionId, proposition.id);
    assert.equal(response.body[0].status, "assigned");
    assert.equal(
      ["dispatch_user_a", "dispatch_user_b"].includes(response.body[0].userId),
      true,
    );

    const tasks = await harness.dispatchTaskRepository.listByProposition(
      proposition.id,
    );
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.id, response.body[0].id);
  });
});

test("internal dispatch route returns 409 when proposition is not live", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const draft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Draft dispatch proposition",
      createdByUserId: "dispatch_owner",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${draft.id}/dispatch`,
      {
        method: "POST",
        user: {
          userId: "operator_dispatch",
          roles: [SystemRole.Operator],
        },
        body: {
          userIds: ["dispatch_user_a"],
          assignedAt: "2026-04-18T10:06:00.000Z",
          expiresAt: "2026-04-18T10:16:00.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.error.code,
      "dispatch_task.proposition_not_live",
    );
  });
});

test("internal dispatch route validates required expiresAt field", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Invalid dispatch payload proposition",
      createdByUserId: "dispatch_owner",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/dispatch`,
      {
        method: "POST",
        user: {
          userId: "operator_dispatch",
          roles: [SystemRole.Operator],
        },
        body: {
          userIds: ["dispatch_user_a"],
          assignedAt: "2026-04-18T10:06:00.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("internal response review route finalizes pending review state for operators", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "HTTP response review proposition",
      createdByUserId: "review_owner",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["review_user"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    assert.ok(task);
    const submitted = await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: task.id,
      userId: "review_user",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-18T10:06:10.000Z",
      clientSubmittedAt: "2026-04-18T10:06:20.000Z",
      submittedAt: "2026-04-18T10:06:20.000Z",
      understandingAck: true,
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/review`,
      {
        method: "POST",
        user: {
          userId: "operator_review",
          roles: [SystemRole.Operator],
        },
        body: {
          reviewedAt: "2026-04-18T10:07:00.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.responseId, submitted.id);
    assert.equal(response.body.status, "valid");
    assert.equal(response.body.qualityScore, 100);
    assert.deepEqual(response.body.reasonCodes, ["passes_quality_checks"]);
    assert.equal(response.body.reviewedByUserId, "operator_review");

    const persisted = await harness.qualityEngineService.getReviewForResponse(
      submitted.id,
    );
    assert.equal(persisted?.status, "valid");
    assert.equal(persisted?.reviewedByUserId, "operator_review");
  });
});

test("internal response review claim and release routes expose workflow state for operators", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "HTTP response claim proposition",
      createdByUserId: "review_owner",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["claim_user"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    assert.ok(task);
    const submitted = await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: task.id,
      userId: "claim_user",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-18T10:06:10.000Z",
      clientSubmittedAt: "2026-04-18T10:06:20.000Z",
      submittedAt: "2026-04-18T10:06:20.000Z",
      understandingAck: true,
    });
    const claimedAt = new Date().toISOString();
    const releasedAt = new Date(Date.now() + 1_000).toISOString();

    const initialState = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/review-state`,
      {
        user: {
          userId: "operator_claim_owner",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(initialState.status, HttpStatus.OK);
    assert.equal(initialState.body.responseId, submitted.id);
    assert.equal(initialState.body.reviewStatus, "pending_review");
    assert.equal(initialState.body.workflowState, "unclaimed");
    assert.equal(initialState.body.claimedByUserId, null);

    const claimResponse = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/claim`,
      {
        method: "POST",
        user: {
          userId: "operator_claim_owner",
          roles: [SystemRole.Operator],
        },
        body: {
          claimedAt,
          note: "start_review_triage",
        },
      },
    );

    assert.equal(claimResponse.status, HttpStatus.CREATED);
    assert.equal(claimResponse.body.responseId, submitted.id);
    assert.equal(claimResponse.body.reviewStatus, "pending_review");
    assert.equal(claimResponse.body.workflowState, "claimed");
    assert.equal(claimResponse.body.claimedByUserId, "operator_claim_owner");
    assert.equal(claimResponse.body.claimedAt, claimedAt);
    assert.equal(claimResponse.body.claimStaleAfterSeconds, 15 * 60);
    assert.equal(claimResponse.body.isClaimStale, false);

    const claimedState = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/review-state`,
      {
        user: {
          userId: "operator_claim_owner",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(claimedState.status, HttpStatus.OK);
    assert.equal(claimedState.body.workflowState, "claimed");
    assert.equal(claimedState.body.claimedByUserId, "operator_claim_owner");

    const releaseResponse = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/release`,
      {
        method: "POST",
        user: {
          userId: "operator_claim_owner",
          roles: [SystemRole.Operator],
        },
        body: {
          releasedAt,
          note: "handoff_review",
        },
      },
    );

    assert.equal(releaseResponse.status, HttpStatus.CREATED);
    assert.equal(releaseResponse.body.responseId, submitted.id);
    assert.equal(releaseResponse.body.reviewStatus, "pending_review");
    assert.equal(releaseResponse.body.workflowState, "released");
    assert.equal(releaseResponse.body.claimedByUserId, "operator_claim_owner");
    assert.equal(releaseResponse.body.releasedByUserId, "operator_claim_owner");
    assert.equal(releaseResponse.body.releasedAt, releasedAt);
    assert.equal(releaseResponse.body.isClaimStale, false);

    const releasedState = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/review-state`,
      {
        user: {
          userId: "operator_claim_owner",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(releasedState.status, HttpStatus.OK);
    assert.equal(releasedState.body.workflowState, "released");
    assert.equal(releasedState.body.releasedByUserId, "operator_claim_owner");
    assert.equal(releasedState.body.releasedAt, releasedAt);
  });
});

test("internal response review claim route returns 409 when another operator holds the active claim", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "HTTP response claim conflict proposition",
      createdByUserId: "review_owner",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["claim_conflict_user"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    assert.ok(task);
    const submitted = await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: task.id,
      userId: "claim_conflict_user",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-18T10:06:10.000Z",
      clientSubmittedAt: "2026-04-18T10:06:20.000Z",
      submittedAt: "2026-04-18T10:06:20.000Z",
      understandingAck: true,
    });
    const firstClaimedAt = new Date().toISOString();

    const firstClaim = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/claim`,
      {
        method: "POST",
        user: {
          userId: "operator_claim_a",
          roles: [SystemRole.Operator],
        },
        body: {
          claimedAt: firstClaimedAt,
        },
      },
    );

    assert.equal(firstClaim.status, HttpStatus.CREATED);

    const conflictingClaim = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/claim`,
      {
        method: "POST",
        user: {
          userId: "operator_claim_b",
          roles: [SystemRole.Operator],
        },
        body: {
          claimedAt: new Date(Date.now() + 1_000).toISOString(),
        },
      },
    );

    assert.equal(conflictingClaim.status, HttpStatus.CONFLICT);
    assert.equal(conflictingClaim.body.success, false);
    assert.equal(
      conflictingClaim.body.error.code,
      "response_review.claim_conflict",
    );
    assert.equal(
      conflictingClaim.body.error.message,
      "Pending response review is already claimed by another operator",
    );
  });
});

test("internal response review route returns 409 when another operator tries to finalize an active claim", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "HTTP response review claim conflict proposition",
      createdByUserId: "review_owner",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["review_conflict_user"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    assert.ok(task);
    const submitted = await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: task.id,
      userId: "review_conflict_user",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-18T10:06:10.000Z",
      clientSubmittedAt: "2026-04-18T10:06:20.000Z",
      submittedAt: "2026-04-18T10:06:20.000Z",
      understandingAck: true,
    });

    const claimResponse = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/claim`,
      {
        method: "POST",
        user: {
          userId: "operator_review_owner",
          roles: [SystemRole.Operator],
        },
        body: {
          claimedAt: new Date().toISOString(),
        },
      },
    );

    assert.equal(claimResponse.status, HttpStatus.CREATED);

    const reviewResponse = await requestJson(
      baseUrl,
      `/arena/internal/responses/${submitted.id}/review`,
      {
        method: "POST",
        user: {
          userId: "operator_review_other",
          roles: [SystemRole.Operator],
        },
        body: {
          reviewedAt: new Date(Date.now() + 1_000).toISOString(),
        },
      },
    );

    assert.equal(reviewResponse.status, HttpStatus.CONFLICT);
    assert.equal(reviewResponse.body.success, false);
    assert.equal(
      reviewResponse.body.error.code,
      "response_review.review_claim_conflict",
    );
    assert.equal(
      reviewResponse.body.error.message,
      "Pending response review is already claimed by another operator",
    );
  });
});

test("internal response review route returns 404 for missing responses", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/responses/response_missing/review",
      {
        method: "POST",
        user: {
          userId: "operator_review",
          roles: [SystemRole.Operator],
        },
        body: {
          reviewedAt: "2026-04-18T10:07:00.000Z",
        },
      },
    );

    assert.equal(response.status, HttpStatus.NOT_FOUND);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "response.not_found");
  });
});

test("internal response review route validates reviewedAt payload", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/responses/response_1/review",
      {
        method: "POST",
        user: {
          userId: "operator_review",
          roles: [SystemRole.Operator],
        },
        body: {},
      },
    );

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});

test("creator proposition endpoints expose owned propositions across draft scheduled live and settled lifecycle states", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const draftResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_lifecycle",
        roles: [SystemRole.User],
      },
      body: {
        title: "Draft lifecycle proposition",
        summary:
          "The creator should keep a real backend read model for propositions even before review is completed.",
        optionA: "Draft",
        optionB: "Not draft",
        category: "ai",
      },
    });
    const draftId = draftResponse.body.propositionId as string;

    const scheduledDraft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Scheduled lifecycle proposition",
      createdByUserId: "creator_lifecycle",
      marketEnabled: false,
    });
    await harness.propositionDraftService.submitDraft({
      propositionId: scheduledDraft.id,
      userId: "creator_lifecycle",
      note: "ready_for_schedule",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: scheduledDraft.id,
      publishedAt: "2026-04-18T10:30:00.000Z",
      updatedByUserId: "operator_schedule",
    });

    const live = await createLiveProposition(harness, {
      title: "Live lifecycle proposition",
      createdByUserId: "creator_lifecycle",
      marketEnabled: false,
    });

    const settled = await createLiveProposition(harness, {
      title: "Settled lifecycle proposition",
      createdByUserId: "creator_lifecycle",
      marketEnabled: true,
      minEffectiveSample: 1,
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_result_participant"],
      assignedAt: arenaTime(310),
      expiresAt: arenaTime(320),
    });
    assert.ok(task);
    const response = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: task.id,
      userId: "creator_result_participant",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(310, 10),
      clientSubmittedAt: arenaTime(310, 20),
      understandingAck: true,
      submittedAt: arenaTime(310, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: response.id,
      status: "valid",
      reviewedAt: arenaTime(310, 30),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const settledMarket = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(settledMarket);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: settledMarket.id,
      userId: "creator_result_participant",
      selectedOption: 0,
      stakeAmount: "25",
      placedAt: "2026-04-18T15:12:00.000Z",
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: "2026-04-18T15:13:00.000Z",
      updatedByUserId: "operator_settle",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: "2026-04-18T15:14:00.000Z",
    });

    const listResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine",
      {
        user: {
          userId: "creator_lifecycle",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.length, 4);
    assert.equal(
      listResponse.body.some(
        (item: { propositionId: string; status: string; submissionStatus: string }) =>
          item.propositionId === draftId &&
          item.status === "draft" &&
          item.submissionStatus === "draft",
      ),
      true,
    );
    assert.equal(
      listResponse.body.some(
        (item: { propositionId: string; status: string; submissionStatus: string }) =>
          item.propositionId === scheduled.id &&
          item.status === "scheduled" &&
          item.submissionStatus === "approved",
      ),
      true,
    );
    assert.equal(
      listResponse.body.some(
        (item: { propositionId: string; status: string }) =>
          item.propositionId === live.id && item.status === "live",
      ),
      true,
    );
    assert.equal(
      listResponse.body.some(
        (item: { propositionId: string; status: string }) =>
          item.propositionId === settled.id && item.status === "settled",
      ),
      true,
    );

    const settledDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${settled.id}`,
      {
        user: {
          userId: "creator_lifecycle",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(settledDetailResponse.status, HttpStatus.OK);
    assert.equal(settledDetailResponse.body.proposition.id, settled.id);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        settledDetailResponse.body.proposition,
        "createdByUserId",
      ),
      false,
    );
    assert.equal(settledDetailResponse.body.submission.status, "approved");
    assert.equal(settledDetailResponse.body.proposition.status, "settled");
    assert.equal(settledDetailResponse.body.market.status, "settled");
    assert.equal(settledDetailResponse.body.revealSettlement.resultKind, "resolved");
    assert.equal(typeof settledDetailResponse.body.revealSettlement.settledAt, "string");
    assert.equal("auditEvents" in settledDetailResponse.body, false);
    assert.equal("rewardAuditEvents" in settledDetailResponse.body, false);
    assert.equal("validationChainActivity" in settledDetailResponse.body, false);

    const otherCreatorDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${settled.id}`,
      {
        user: {
          userId: "creator_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherCreatorDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(otherCreatorDetailResponse.body.error.code, "proposition.not_found");
  });
});

test("creator proposition detail stays non-directional before settlement and exposes a settled report afterwards", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Requester settled report proposition",
      description:
        "Requester-owned proposition reporting must preserve no-direction leakage before settlement and return a real settled summary afterwards.",
      options: ["Approve", "Reject"],
      sampleConstraints: ["wallet_signed"],
      minEffectiveSample: 1,
      minBetAmount: "15",
      marketEnabled: true,
      createdByUserId: "creator_report",
    });
    await harness.userIdentityService.ensureUserExists("creator_report_participant");
    await harness.userRepository.updatePrimaryWalletAddress(
      "creator_report_participant",
      "0x00000000000000000000000000000000000000d1",
    );
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_report",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_report",
    });

    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: live.id,
      userIds: ["creator_report_participant"],
      assignedAt: arenaTime(330),
      expiresAt: arenaTime(340),
    });
    assert.ok(task);
    const response = await harness.responseService.submitResponse({
      propositionId: live.id,
      taskId: task.id,
      userId: "creator_report_participant",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(330, 10),
      clientSubmittedAt: arenaTime(330, 20),
      understandingAck: true,
      submittedAt: arenaTime(330, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: response.id,
      status: "valid",
      reviewedAt: arenaTime(330, 30),
      reviewedByUserId: "reviewer_report",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(live.id);

    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    await harness.betService.placeBet({
      propositionId: live.id,
      marketId: market.id,
      userId: "creator_report_participant",
      selectedOption: 1,
      stakeAmount: "35",
      placedAt: "2026-04-18T15:32:00.000Z",
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: live.id,
      now: "2026-04-18T15:33:00.000Z",
      updatedByUserId: "operator_report",
    });

    const preSettlementDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}`,
      {
        user: {
          userId: "creator_report",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(preSettlementDetailResponse.status, HttpStatus.OK);
    assert.equal(preSettlementDetailResponse.body.proposition.status, "revealing");
    assert.equal(preSettlementDetailResponse.body.proposition.optionA, "Approve");
    assert.equal(preSettlementDetailResponse.body.proposition.optionB, "Reject");
    assert.deepEqual(
      preSettlementDetailResponse.body.proposition.sampleConstraints,
      ["wallet_signed"],
    );
    assert.equal(preSettlementDetailResponse.body.proposition.minBetAmount, "15");
    assert.equal(preSettlementDetailResponse.body.proposition.resultComputedAt, null);
    assert.equal(preSettlementDetailResponse.body.market.status, "frozen_for_reveal");
    assert.equal(preSettlementDetailResponse.body.revealSettlement.resultKind, null);
    assert.equal(preSettlementDetailResponse.body.revealSettlement.winningOption, null);
    assert.equal(preSettlementDetailResponse.body.revealSettlement.voidReason, null);
    assert.equal(preSettlementDetailResponse.body.revealSettlement.resultComputedAt, null);
    assert.equal(preSettlementDetailResponse.body.revealSettlement.lastPublicResult, null);
    assert.equal(preSettlementDetailResponse.body.budgetSummary.configuredAmount, "1000");
    assert.equal(preSettlementDetailResponse.body.budgetSummary.reservedAmount, "0");
    assert.equal(preSettlementDetailResponse.body.budgetSummary.spentAmount, "20");
    assert.equal(preSettlementDetailResponse.body.budgetSummary.remainingAmount, "980");

    const preSettlementReportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}/report`,
      {
        user: {
          userId: "creator_report",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(preSettlementReportResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      preSettlementReportResponse.body.error.code,
      "proposition.report_not_ready",
    );

    await harness.validationSettlementService.settleValidationMarket({
      propositionId: live.id,
      settledAt: "2026-04-18T15:34:00.000Z",
    });

    const settledReportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}/report`,
      {
        user: {
          userId: "creator_report",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(settledReportResponse.status, HttpStatus.OK);
    assert.equal(settledReportResponse.body.proposition.id, live.id);
    assert.equal(settledReportResponse.body.proposition.optionA, "Approve");
    assert.equal(settledReportResponse.body.proposition.optionB, "Reject");
    assert.equal(settledReportResponse.body.result.resultKind, "resolved");
    assert.equal(settledReportResponse.body.result.winningOption, 1);
    assert.equal(settledReportResponse.body.result.winningOptionLabel, "Reject");
    assert.equal(settledReportResponse.body.result.settledAt, "2026-04-18T15:34:00.000Z");
    assert.equal(settledReportResponse.body.sample.effectiveSampleCount, 1);
    assert.equal(settledReportResponse.body.reviewSummary.validCount, 1);
    assert.equal(settledReportResponse.body.dispatchSummary.submittedCount, 1);
    assert.equal(settledReportResponse.body.budgetSummary.configuredAmount, "1000");
    assert.equal(settledReportResponse.body.budgetSummary.spentAmount, "20");
    assert.equal(settledReportResponse.body.budgetSummary.remainingAmount, "980");
    assert.equal(typeof settledReportResponse.body.generatedAt, "string");

    const budgetLedgerResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}/budget-ledger`,
      {
        user: {
          userId: "creator_report",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(budgetLedgerResponse.status, HttpStatus.OK);
    assert.equal(budgetLedgerResponse.body.propositionId, live.id);
    assert.equal(budgetLedgerResponse.body.summary.configuredAmount, "1000");
    assert.equal(budgetLedgerResponse.body.summary.spentAmount, "20");
    assert.equal(budgetLedgerResponse.body.summary.remainingAmount, "980");
    assert.equal(budgetLedgerResponse.body.items.length, 1);
    assert.equal(budgetLedgerResponse.body.items[0].entryType, "spent");
    assert.equal(budgetLedgerResponse.body.items[0].spentAmount, "20");
    assert.equal(budgetLedgerResponse.body.items[0].isCurrent, true);

    const otherCreatorReportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}/report`,
      {
        user: {
          userId: "creator_report_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherCreatorReportResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(otherCreatorReportResponse.body.error.code, "proposition.not_found");

    const otherCreatorBudgetLedgerResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/${live.id}/budget-ledger`,
      {
        user: {
          userId: "creator_report_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherCreatorBudgetLedgerResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherCreatorBudgetLedgerResponse.body.error.code,
      "proposition.not_found",
    );
  });
});

test("draft update rejects unsupported sample constraints with a proposition policy error", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const createResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_constraints",
        roles: [SystemRole.User],
      },
      body: {
        category: "general",
        title: "Will this supported draft stay editable?",
        summary:
          "The creator should receive a clear policy error when attempting to persist unsupported sample constraints through the draft API.",
        optionA: "Yes",
        optionB: "No",
      },
    });
    assert.equal(createResponse.status, HttpStatus.CREATED);

    const updateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/drafts/${createResponse.body.propositionId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_constraints",
          roles: [SystemRole.User],
        },
        body: {
          sampleConstraints: ["verified_human"],
        },
      },
    );

    assert.equal(updateResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      updateResponse.body.error.code,
      "proposition.unsupported_sample_constraint",
    );
  });
});

test("creator proposition overview aggregates owned proposition portfolio state without leaking unresolved direction", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const draftResponse = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_overview",
        roles: [SystemRole.User],
      },
      body: {
        title: "Overview draft proposition",
        summary: "Draft proposition for creator overview aggregation.",
        optionA: "Yes",
        optionB: "No",
        category: "general",
      },
    });
    const draftId = draftResponse.body.propositionId as string;

    const scheduledDraft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Overview scheduled proposition",
      createdByUserId: "creator_overview",
      marketEnabled: false,
      category: "ai",
    });
    await harness.propositionDraftService.submitDraft({
      propositionId: scheduledDraft.id,
      userId: "creator_overview",
      note: "overview_schedule",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: scheduledDraft.id,
      publishedAt: "2026-04-18T10:20:00.000Z",
      updatedByUserId: "operator_overview",
    });

    const settled = await createLiveProposition(harness, {
      title: "Overview settled proposition",
      createdByUserId: "creator_overview",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const [settledTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_overview_participant"],
      assignedAt: arenaTime(360),
      expiresAt: arenaTime(370),
    });
    assert.ok(settledTask);
    const settledResponse = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: settledTask.id,
      userId: "creator_overview_participant",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(360, 10),
      clientSubmittedAt: arenaTime(360, 20),
      understandingAck: true,
      submittedAt: arenaTime(360, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledResponse.id,
      status: "valid",
      reviewedAt: arenaTime(360, 30),
      reviewedByUserId: "reviewer_overview",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const settledMarket = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(settledMarket);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: settledMarket.id,
      userId: "creator_overview_participant",
      selectedOption: 0,
      stakeAmount: "20",
      placedAt: arenaTime(361),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(362),
      updatedByUserId: "operator_overview",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(363),
    });

    const revealing = await createLiveProposition(harness, {
      title: "Overview revealing proposition",
      createdByUserId: "creator_overview",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "politics",
    });
    const [revealingTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: revealing.id,
      userIds: ["creator_overview_participant_2"],
      assignedAt: arenaTime(364),
      expiresAt: arenaTime(374),
    });
    assert.ok(revealingTask);
    const revealingResponse = await harness.responseService.submitResponse({
      propositionId: revealing.id,
      taskId: revealingTask.id,
      userId: "creator_overview_participant_2",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(364, 10),
      clientSubmittedAt: arenaTime(364, 20),
      understandingAck: true,
      submittedAt: arenaTime(364, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: revealingResponse.id,
      status: "valid",
      reviewedAt: arenaTime(364, 30),
      reviewedByUserId: "reviewer_overview",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(revealing.id);
    const revealingMarket = await harness.marketRepository.findByPropositionId(revealing.id);
    assert.ok(revealingMarket);
    await harness.betService.placeBet({
      propositionId: revealing.id,
      marketId: revealingMarket.id,
      userId: "creator_overview_participant_2",
      selectedOption: 1,
      stakeAmount: "30",
      placedAt: arenaTime(365),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: revealing.id,
      now: arenaTime(366),
      updatedByUserId: "operator_overview",
    });

    const response = await requestJson(baseUrl, "/arena/propositions/mine/overview", {
      user: {
        userId: "creator_overview",
        roles: [SystemRole.User],
      },
    });

    assert.equal(response.status, HttpStatus.OK);
    assertInternalIdentityAbsentRecursively(response.body);
    assert.equal(response.body.totals.totalCount, 4);
    assert.equal(response.body.totals.draftCount, 1);
    assert.equal(response.body.totals.scheduledCount, 1);
    assert.equal(response.body.totals.settledCount, 1);
    assert.equal(response.body.totals.revealingCount, 1);
    assert.equal(response.body.totals.unresolvedCount, 3);
    assert.equal(response.body.submissionSummary.draftCount, 1);
    assert.equal(response.body.submissionSummary.approvedCount, 3);
    assert.equal(response.body.sampleSummary.totalEffectiveSampleCount, 2);
    assert.equal(response.body.sampleSummary.readyToFreezeCount, 0);
    assert.equal(response.body.sampleSummary.unresolvedAboveMinSampleCount, 1);
    assert.equal(response.body.resultSummary.settledResolvedCount, 1);
    assert.equal(response.body.resultSummary.settledVoidCount, 0);
    assert.equal(response.body.resultSummary.unresolvedHiddenCount, 3);
    assert.equal(response.body.resultSummary.latestSettled?.propositionId, settled.id);
    assert.equal(response.body.resultSummary.latestSettled?.resultKind, "resolved");
    assert.equal(response.body.resultSummary.latestSettled?.winningOption, 0);
    assert.equal(response.body.marketSummary.enabledCount, 2);
    assert.equal(response.body.marketSummary.liveOrRevealingCount, 1);
    assert.equal(response.body.marketSummary.awaitingSettlementCount, 1);
    assert.equal(response.body.recent.length, 4);
    assert.equal(response.body.recent[0].propositionId, revealing.id);
    assert.equal(response.body.recent.some((item: { propositionId: string }) => item.propositionId === draftId), true);
    assert.equal(
      response.body.recent.some(
        (item: { propositionId: string; revealSettlement: { resultKind: string | null } }) =>
          item.propositionId === revealing.id &&
          item.revealSettlement.resultKind === null,
      ),
      true,
    );
    assert.equal(
      response.body.recent.some(
        (item: { propositionId: string; revealSettlement: { winningOption: number | null } }) =>
          item.propositionId === revealing.id &&
          item.revealSettlement.winningOption === null,
      ),
      true,
    );
  });
});

test("creator proposition analytics endpoint returns longer-horizon requester analytics without leaking unresolved direction", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const oldDraft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "Requester analytics outside window",
      createdByUserId: "creator_analytics",
    });
    await harness.propositionRepository.update(oldDraft.id, {
      createdAt: new Date("2026-03-18T09:00:00.000Z"),
      updatedAt: new Date("2026-03-18T09:00:00.000Z"),
    });

    const settled = await createLiveProposition(harness, {
      title: "Requester analytics settled proposition",
      createdByUserId: "creator_analytics",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    await harness.propositionRepository.update(settled.id, {
      createdAt: new Date("2026-04-14T09:00:00.000Z"),
      updatedAt: new Date("2026-04-17T09:00:00.000Z"),
      publishedAt: new Date("2026-04-14T10:00:00.000Z"),
      liveAt: new Date("2026-04-14T10:05:00.000Z"),
    });
    const [settledTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_analytics_participant_a"],
      assignedAt: "2026-04-14T10:06:00.000Z",
      expiresAt: "2026-04-14T10:36:00.000Z",
    });
    assert.ok(settledTask);
    const settledResponse = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: settledTask.id,
      userId: "creator_analytics_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-14T10:06:10.000Z",
      clientSubmittedAt: "2026-04-14T10:06:20.000Z",
      understandingAck: true,
      submittedAt: "2026-04-14T10:06:20.000Z",
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledResponse.id,
      status: "valid",
      reviewedAt: "2026-04-14T10:07:00.000Z",
      reviewedByUserId: "reviewer_analytics",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const settledMarket = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(settledMarket);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: settledMarket.id,
      userId: "creator_analytics_trader_a",
      selectedOption: 0,
      stakeAmount: "22",
      placedAt: "2026-04-14T11:00:00.000Z",
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: "2026-04-15T09:30:00.000Z",
      updatedByUserId: "operator_analytics",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: "2026-04-16T09:30:00.000Z",
    });

    const live = await createLiveProposition(harness, {
      title: "Requester analytics live proposition",
      createdByUserId: "creator_analytics",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    await harness.propositionRepository.update(live.id, {
      createdAt: new Date("2026-04-15T09:00:00.000Z"),
      updatedAt: new Date("2026-04-15T09:00:00.000Z"),
      publishedAt: new Date("2026-04-15T10:00:00.000Z"),
      liveAt: new Date("2026-04-15T10:05:00.000Z"),
    });
    const liveMarket = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(liveMarket);
    await harness.betService.placeBet({
      propositionId: live.id,
      marketId: liveMarket.id,
      userId: "creator_analytics_trader_b",
      selectedOption: 1,
      stakeAmount: "35",
      placedAt: "2026-04-15T12:00:00.000Z",
    });
    await harness.counterService.rebuildCounterForProposition(live.id);

    const revealing = await createLiveProposition(harness, {
      title: "Requester analytics revealing proposition",
      createdByUserId: "creator_analytics",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    await harness.propositionRepository.update(revealing.id, {
      createdAt: new Date("2026-04-16T09:00:00.000Z"),
      updatedAt: new Date("2026-04-17T09:00:00.000Z"),
      publishedAt: new Date("2026-04-16T10:00:00.000Z"),
      liveAt: new Date("2026-04-16T10:05:00.000Z"),
    });
    const [revealingTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: revealing.id,
      userIds: ["creator_analytics_participant_b"],
      assignedAt: "2026-04-16T10:06:00.000Z",
      expiresAt: "2026-04-16T10:36:00.000Z",
    });
    assert.ok(revealingTask);
    const revealingResponse = await harness.responseService.submitResponse({
      propositionId: revealing.id,
      taskId: revealingTask.id,
      userId: "creator_analytics_participant_b",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: "2026-04-16T10:06:10.000Z",
      clientSubmittedAt: "2026-04-16T10:06:20.000Z",
      understandingAck: true,
      submittedAt: "2026-04-16T10:06:20.000Z",
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: revealingResponse.id,
      status: "partial_valid",
      reviewedAt: "2026-04-16T10:07:00.000Z",
      reviewedByUserId: "reviewer_analytics",
      qualityScore: 85,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.partial_valid],
    });
    await harness.counterService.rebuildCounterForProposition(revealing.id);
    const revealingMarket = await harness.marketRepository.findByPropositionId(revealing.id);
    assert.ok(revealingMarket);
    await harness.betService.placeBet({
      propositionId: revealing.id,
      marketId: revealingMarket.id,
      userId: "creator_analytics_trader_c",
      selectedOption: 1,
      stakeAmount: "18",
      placedAt: "2026-04-16T12:00:00.000Z",
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: revealing.id,
      now: "2026-04-17T09:30:00.000Z",
      updatedByUserId: "operator_analytics",
    });

    const response = await requestJson(
      baseUrl,
      "/arena/propositions/mine/analytics?windowDays=30&now=2026-04-18T12:00:00.000Z",
      {
        user: {
          userId: "creator_analytics",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assertInternalIdentityAbsentRecursively(response.body);
    assert.equal(response.body.windowDays, 30);
    assert.equal(response.body.totals.createdCount, 3);
    assert.equal(response.body.totals.settledCount, 1);
    assert.equal(response.body.totals.unresolvedCount, 2);
    assert.equal(response.body.totals.marketEnabledCount, 3);
    assert.equal(response.body.totals.totalEffectiveSampleCount, 2);
    assert.equal(response.body.totals.totalReviewedResponseCount, 2);
    assert.equal(response.body.totals.totalBetCount, 3);
    assert.equal(response.body.totals.totalBetStakeAmount, "75");
    assert.equal(response.body.totals.uniqueTraderCount, 3);
    assert.equal(response.body.lifecycle.averageHoursToPublish, 1);
    assert.equal(response.body.lifecycle.averageHoursToLive, 0.08);
    assert.equal(response.body.lifecycle.averageHoursToFreeze, 23.42);
    assert.equal(response.body.lifecycle.averageHoursToSettle, 47.42);
    assert.equal(response.body.categoryHistory.length, 2);
    assert.equal(response.body.categoryHistory[0].category, "ai");
    assert.equal(response.body.categoryHistory[0].propositionCount, 2);
    assert.equal(response.body.categoryHistory[0].settledCount, 1);
    assert.equal(response.body.categoryHistory[0].unresolvedCount, 1);
    assert.equal(response.body.categoryHistory[0].totalEffectiveSampleCount, 2);
    assert.equal(response.body.categoryHistory[0].totalReviewedResponseCount, 2);
    assert.equal(response.body.categoryHistory[0].totalBetCount, 2);
    assert.equal(response.body.categoryHistory[0].totalBetStakeAmount, "40");
    assert.equal(response.body.categoryHistory[0].uniqueTraderCount, 2);
    assert.equal(response.body.categoryHistory[1].category, "sports");
    assert.equal(response.body.categoryHistory[1].totalBetStakeAmount, "35");
    assert.equal(response.body.trend.length, 3);
    assert.deepEqual(
      response.body.trend.map(
        (item: {
          date: string;
          createdCount: number;
          settledCount: number;
          reviewedResponseCount: number;
          effectiveSampleCount: number;
          betCount: number;
          betStakeAmount: string;
        }) => ({
          date: item.date,
          createdCount: item.createdCount,
          settledCount: item.settledCount,
          reviewedResponseCount: item.reviewedResponseCount,
          effectiveSampleCount: item.effectiveSampleCount,
          betCount: item.betCount,
          betStakeAmount: item.betStakeAmount,
        }),
      ),
      [
        {
          date: "2026-04-14",
          createdCount: 1,
          settledCount: 0,
          reviewedResponseCount: 1,
          effectiveSampleCount: 1,
          betCount: 1,
          betStakeAmount: "22",
        },
        {
          date: "2026-04-15",
          createdCount: 1,
          settledCount: 0,
          reviewedResponseCount: 0,
          effectiveSampleCount: 0,
          betCount: 1,
          betStakeAmount: "35",
        },
        {
          date: "2026-04-16",
          createdCount: 1,
          settledCount: 1,
          reviewedResponseCount: 1,
          effectiveSampleCount: 1,
          betCount: 1,
          betStakeAmount: "18",
        },
      ],
    );
    assert.equal(response.body.delivery.exportCount, 0);
    assert.equal(response.body.delivery.latestExportAt, null);
    assert.equal(response.body.delivery.latestExportId, null);
  });
});

test("creator proposition analytics query validation still returns 400 Bad Request", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/propositions/mine/analytics?windowDays=0&now=2026-04-18T12:00:00.000Z",
      {
        user: {
          userId: "creator_analytics_invalid",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed");
  });
});

test("creator proposition export endpoints create and list real owned proposition exports", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settled = await createLiveProposition(harness, {
      title: "Requester export settled proposition",
      createdByUserId: "creator_export",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_export_participant"],
      assignedAt: arenaTime(390),
      expiresAt: arenaTime(400),
    });
    assert.ok(task);
    const response = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: task.id,
      userId: "creator_export_participant",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(390, 10),
      clientSubmittedAt: arenaTime(390, 20),
      understandingAck: true,
      submittedAt: arenaTime(390, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: response.id,
      status: "valid",
      reviewedAt: arenaTime(390, 30),
      reviewedByUserId: "reviewer_export",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const market = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(market);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: market.id,
      userId: "creator_export_participant",
      selectedOption: 0,
      stakeAmount: "22",
      placedAt: arenaTime(391),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(392),
      updatedByUserId: "operator_export",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(393),
    });

    const open = await createLiveProposition(harness, {
      title: "Requester export open proposition",
      createdByUserId: "creator_export",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const openMarket = await harness.marketRepository.findByPropositionId(open.id);
    assert.ok(openMarket);
    await harness.betService.placeBet({
      propositionId: open.id,
      marketId: openMarket.id,
      userId: "creator_export_trader",
      selectedOption: 1,
      stakeAmount: "35",
      placedAt: arenaTime(394),
    });
    await harness.counterService.rebuildCounterForProposition(open.id);

    const initialListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        user: {
          userId: "creator_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialListResponse.status, HttpStatus.OK);
    assert.equal(initialListResponse.body.totalCount, 0);
    assert.deepEqual(initialListResponse.body.items, []);

    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        method: "POST",
        user: {
          userId: "creator_export",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(createResponse.body);
    assert.equal(createResponse.body.status, "completed");
    assert.equal(createResponse.body.format, "json");
    assert.equal(createResponse.body.fileName.endsWith(".json"), true);
    assertInternalIdentityAbsentRecursively(createResponse.body.overview);
    assert.equal(createResponse.body.overview.totals.totalCount, 2);
    assert.equal(createResponse.body.overview.totals.settledCount, 1);
    assert.equal(createResponse.body.overview.marketSummary.awaitingSettlementCount, 0);
    assertInternalIdentityAbsentRecursively(createResponse.body.analytics);
    assert.equal(createResponse.body.analytics.windowDays, 30);
    assert.equal(createResponse.body.analytics.totals.createdCount, 2);
    assert.equal(createResponse.body.analytics.totals.settledCount, 1);
    assert.equal(createResponse.body.analytics.totals.totalBetStakeAmount, "57");
    assert.equal(createResponse.body.analytics.delivery.exportCount, 0);
    assert.equal(createResponse.body.reports.length, 1);
    assert.equal(createResponse.body.reports[0].proposition.id, settled.id);
    assert.equal(createResponse.body.reports[0].result.resultKind, "resolved");
    assert.equal(createResponse.body.reports[0].result.winningOptionLabel, "A");
    assert.equal(createResponse.body.metrics.settledReportCount, 1);
    assert.equal(createResponse.body.metrics.openLifecycleCount, 1);

    const listResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        user: {
          userId: "creator_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.items[0].exportId, createResponse.body.exportId);
    assert.equal(listResponse.body.items[0].metrics.settledReportCount, 1);
    assert.equal(listResponse.body.items[0].metrics.openLifecycleCount, 1);

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.exportId, createResponse.body.exportId);
    assertInternalIdentityAbsentRecursively(detailResponse.body);
    assertInternalIdentityAbsentRecursively(detailResponse.body.overview);
    assertInternalIdentityAbsentRecursively(detailResponse.body.analytics);
    assert.equal(detailResponse.body.analytics.windowDays, 30);
    assert.equal(detailResponse.body.analytics.delivery.exportCount, 0);
    assert.equal(detailResponse.body.reports.length, 1);
    assert.equal(detailResponse.body.reports[0].proposition.id, settled.id);

    const otherUserDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_export_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(otherUserDetailResponse.body.error.code, "proposition_export.not_found");
  });
});

test("creator proposition export endpoints can persist csv artifacts from preset default format", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settled = await createLiveProposition(harness, {
      title: "Requester export CSV settled proposition",
      createdByUserId: "creator_export_csv",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_export_csv_participant"],
      assignedAt: arenaTime(393, 10),
      expiresAt: arenaTime(393, 20),
    });
    assert.ok(task);
    const response = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: task.id,
      userId: "creator_export_csv_participant",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(393, 11),
      clientSubmittedAt: arenaTime(393, 12),
      understandingAck: true,
      submittedAt: arenaTime(393, 12),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: response.id,
      status: "valid",
      reviewedAt: arenaTime(393, 13),
      reviewedByUserId: "reviewer_export_csv",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const market = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(market);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: market.id,
      userId: "creator_export_csv_trader",
      selectedOption: 1,
      stakeAmount: "41",
      placedAt: arenaTime(393, 14),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(393, 15),
      updatedByUserId: "operator_export_csv",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(393, 16),
    });

    const presetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_export_csv",
          roles: [SystemRole.User],
        },
        body: {
          name: "CSV export preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "csv",
        },
      },
    );

    assert.equal(presetResponse.status, HttpStatus.CREATED);

    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        method: "POST",
        user: {
          userId: "creator_export_csv",
          roles: [SystemRole.User],
        },
        body: {
          presetId: presetResponse.body.presetId,
        },
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assert.equal(createResponse.body.format, "csv");
    assert.equal(createResponse.body.fileName.endsWith(".csv"), true);
    assert.equal(createResponse.body.serialized.mediaType, "text/csv");
    assert.equal(
      createResponse.body.serialized.fileName,
      createResponse.body.fileName,
    );
    assert.match(
      createResponse.body.serialized.content,
      /propositionId,title,category,status,resultKind,winningOptionLabel,settledAt,effectiveSampleCount,reviewedResponseCount,validCount,partialValidCount,invalidCount/u,
    );
    assert.match(
      createResponse.body.serialized.content,
      new RegExp(settled.id, "u"),
    );

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_export_csv",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.format, "csv");
    assert.equal(detailResponse.body.serialized.mediaType, "text/csv");
    assert.equal(
      detailResponse.body.serialized.content,
      createResponse.body.serialized.content,
    );

    const listResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        user: {
          userId: "creator_export_csv",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.items[0].exportId, createResponse.body.exportId);
    assert.equal(listResponse.body.items[0].format, "csv");
    assert.equal(listResponse.body.items[0].fileName.endsWith(".csv"), true);
  });
});

test("creator requester report preset CRUD endpoints persist scoped reporting config", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const initialListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialListResponse.status, HttpStatus.OK);
    assert.equal(initialListResponse.body.totalCount, 0);
    assert.deepEqual(initialListResponse.body.items, []);

    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
        body: {
          name: "AI settled snapshot",
          description: "Requester reporting preset for settled AI markets only.",
          windowDays: 21,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(createResponse.body);
    assert.equal(createResponse.body.name, "AI settled snapshot");
    assert.equal(
      createResponse.body.description,
      "Requester reporting preset for settled AI markets only.",
    );
    assert.equal(createResponse.body.config.windowDays, 21);
    assert.deepEqual(createResponse.body.config.categories, ["ai"]);
    assert.equal(createResponse.body.config.marketEnabledOnly, true);
    assert.equal(createResponse.body.config.statusScope, "settled");
    assert.equal(createResponse.body.config.defaultExportFormat, "json");

    const listResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.items[0].presetId, createResponse.body.presetId);
    assert.equal(listResponse.body.items[0].name, "AI settled snapshot");

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.presetId, createResponse.body.presetId);
    assert.equal(detailResponse.body.config.statusScope, "settled");

    const updateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
        body: {
          name: "AI and sports lifecycle",
          categories: ["ai", "sports"],
          marketEnabledOnly: false,
          statusScope: "all",
        },
      },
    );

    assert.equal(updateResponse.status, HttpStatus.OK);
    assert.equal(updateResponse.body.presetId, createResponse.body.presetId);
    assert.equal(updateResponse.body.name, "AI and sports lifecycle");
    assert.deepEqual(updateResponse.body.config.categories, ["ai", "sports"]);
    assert.equal(updateResponse.body.config.marketEnabledOnly, false);
    assert.equal(updateResponse.body.config.statusScope, "all");
    assert.equal(updateResponse.body.config.windowDays, 21);

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(deleteResponse.status, HttpStatus.OK);
    assertInternalIdentityAbsentRecursively(deleteResponse.body);
    assert.equal(deleteResponse.body.presetId, createResponse.body.presetId);
    assert.equal(deleteResponse.body.deleted, true);

    const finalListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        user: {
          userId: "creator_report_preset",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(finalListResponse.status, HttpStatus.OK);
    assert.equal(finalListResponse.body.totalCount, 0);
    assert.deepEqual(finalListResponse.body.items, []);
  });
});

test("creator requester report presets enforce owner isolation across detail, update, and delete", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_preset_owner",
          roles: [SystemRole.User],
        },
        body: {
          name: "Owner preset",
          windowDays: 14,
          categories: ["general"],
          marketEnabledOnly: false,
          statusScope: "unresolved",
          defaultExportFormat: "json",
        },
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);

    const otherUserDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        user: {
          userId: "creator_report_preset_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDetailResponse.body.error.code,
      "requester_report_preset.not_found",
    );

    const otherUserUpdateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_report_preset_other",
          roles: [SystemRole.User],
        },
        body: {
          name: "Hijacked preset",
        },
      },
    );

    assert.equal(otherUserUpdateResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserUpdateResponse.body.error.code,
      "requester_report_preset.not_found",
    );

    const otherUserDeleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${createResponse.body.presetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_report_preset_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDeleteResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDeleteResponse.body.error.code,
      "requester_report_preset.not_found",
    );
  });
});

test("creator requester report preset validation and preset lookup failures stay structured", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const invalidCreateResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_preset_invalid",
          roles: [SystemRole.User],
        },
        body: {
          name: "Invalid preset",
          windowDays: 0,
          statusScope: "settled",
        },
      },
    );

    assert.equal(invalidCreateResponse.status, HttpStatus.BAD_REQUEST);
    assert.equal(invalidCreateResponse.body.success, false);
    assert.equal(invalidCreateResponse.body.error.code, "VALIDATION_ERROR");
    assert.equal(invalidCreateResponse.body.error.message, "Request validation failed");

    const analyticsResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/analytics?presetId=missing_preset_1",
      {
        user: {
          userId: "creator_report_preset_invalid",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(analyticsResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      analyticsResponse.body.error.code,
      "requester_report_preset.not_found",
    );
  });
});

test("deleting a requester report preset fails while saved comparison sets still reference it", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const presetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_preset_referenced",
          roles: [SystemRole.User],
        },
        body: {
          name: "Referenced preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_report_preset_referenced",
          roles: [SystemRole.User],
        },
        body: {
          name: "Preset dependency set",
          presetIds: [presetResponse.body.presetId],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${presetResponse.body.presetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_report_preset_referenced",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(deleteResponse.status, HttpStatus.CONFLICT);
    assert.equal(deleteResponse.body.success, false);
    assert.equal(
      deleteResponse.body.error.code,
      "requester_report_preset.in_use_by_comparison_set",
    );
    assert.equal(
      deleteResponse.body.error.message,
      "Requester report preset cannot be deleted while saved comparison sets still reference it",
    );

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${presetResponse.body.presetId}`,
      {
        user: {
          userId: "creator_report_preset_referenced",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.presetId, presetResponse.body.presetId);
  });
});

test("creator requester report presets drive scoped analytics and export generation", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Preset scoped settled AI proposition",
      createdByUserId: "creator_report_scope",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_report_scope_participant_a"],
      assignedAt: arenaTime(420),
      expiresAt: arenaTime(430),
    });
    assert.ok(settledTask);
    const settledResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledTask.id,
      userId: "creator_report_scope_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(420, 10),
      clientSubmittedAt: arenaTime(420, 20),
      understandingAck: true,
      submittedAt: arenaTime(420, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledResponse.id,
      status: "valid",
      reviewedAt: arenaTime(420, 30),
      reviewedByUserId: "reviewer_report_scope",
      qualityScore: 99,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledMarket.id,
      userId: "creator_report_scope_trader_a",
      selectedOption: 0,
      stakeAmount: "21",
      placedAt: arenaTime(421),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(422),
      updatedByUserId: "operator_report_scope",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(423),
    });

    const unresolvedAi = await createLiveProposition(harness, {
      title: "Preset scoped unresolved AI proposition",
      createdByUserId: "creator_report_scope",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const unresolvedAiMarket = await harness.marketRepository.findByPropositionId(unresolvedAi.id);
    assert.ok(unresolvedAiMarket);
    await harness.betService.placeBet({
      propositionId: unresolvedAi.id,
      marketId: unresolvedAiMarket.id,
      userId: "creator_report_scope_trader_b",
      selectedOption: 1,
      stakeAmount: "17",
      placedAt: arenaTime(424),
    });

    const unresolvedSports = await createLiveProposition(harness, {
      title: "Preset scoped unresolved sports proposition",
      createdByUserId: "creator_report_scope",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const unresolvedSportsMarket = await harness.marketRepository.findByPropositionId(
      unresolvedSports.id,
    );
    assert.ok(unresolvedSportsMarket);
    await harness.betService.placeBet({
      propositionId: unresolvedSports.id,
      marketId: unresolvedSportsMarket.id,
      userId: "creator_report_scope_trader_c",
      selectedOption: 1,
      stakeAmount: "35",
      placedAt: arenaTime(425),
    });

    const presetCreateResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_scope",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled AI delivery",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );

    assert.equal(presetCreateResponse.status, HttpStatus.CREATED);

    const analyticsResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/analytics?presetId=${presetCreateResponse.body.presetId}`,
      {
        user: {
          userId: "creator_report_scope",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(analyticsResponse.status, HttpStatus.OK);
    assert.equal(analyticsResponse.body.totals.createdCount, 1);
    assert.equal(analyticsResponse.body.totals.settledCount, 1);
    assert.equal(analyticsResponse.body.totals.unresolvedCount, 0);
    assert.equal(analyticsResponse.body.totals.totalBetCount, 1);
    assert.equal(analyticsResponse.body.totals.totalBetStakeAmount, "21");
    assert.equal(analyticsResponse.body.categoryHistory.length, 1);
    assert.equal(analyticsResponse.body.categoryHistory[0].category, "ai");
    assert.equal(analyticsResponse.body.delivery.exportCount, 0);
    assert.equal(
      analyticsResponse.body.preset.presetId,
      presetCreateResponse.body.presetId,
    );

    const exportCreateResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        method: "POST",
        user: {
          userId: "creator_report_scope",
          roles: [SystemRole.User],
        },
        body: {
          presetId: presetCreateResponse.body.presetId,
        },
      },
    );

    assert.equal(exportCreateResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(exportCreateResponse.body);
    assert.equal(
      exportCreateResponse.body.preset.presetId,
      presetCreateResponse.body.presetId,
    );
    assert.equal(exportCreateResponse.body.overview.totals.totalCount, 1);
    assert.equal(exportCreateResponse.body.overview.totals.settledCount, 1);
    assert.equal(exportCreateResponse.body.overview.totals.unresolvedCount, 0);
    assert.equal(exportCreateResponse.body.analytics.totals.createdCount, 1);
    assert.equal(exportCreateResponse.body.analytics.totals.totalBetCount, 1);
    assert.equal(exportCreateResponse.body.reports.length, 1);
    assert.equal(exportCreateResponse.body.reports[0].proposition.id, settledAi.id);

    const exportListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports",
      {
        user: {
          userId: "creator_report_scope",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(exportListResponse.status, HttpStatus.OK);
    assert.equal(exportListResponse.body.totalCount, 1);
    assert.equal(
      exportListResponse.body.items[0].preset.presetId,
      presetCreateResponse.body.presetId,
    );
  });
});

test("creator requester report preset comparison endpoint returns preset-backed analytics cohorts", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison settled AI proposition",
      createdByUserId: "creator_report_compare",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_report_compare_participant_a"],
      assignedAt: arenaTime(430),
      expiresAt: arenaTime(440),
    });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_report_compare_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(430, 10),
      clientSubmittedAt: arenaTime(430, 20),
      understandingAck: true,
      submittedAt: arenaTime(430, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(430, 30),
      reviewedByUserId: "reviewer_report_compare",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_report_compare_trader_a",
      selectedOption: 0,
      stakeAmount: "23",
      placedAt: arenaTime(431),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(432),
      updatedByUserId: "operator_report_compare",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(433),
    });

    const unresolvedAi = await createLiveProposition(harness, {
      title: "Comparison unresolved AI proposition",
      createdByUserId: "creator_report_compare",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const unresolvedAiMarket = await harness.marketRepository.findByPropositionId(unresolvedAi.id);
    assert.ok(unresolvedAiMarket);
    await harness.betService.placeBet({
      propositionId: unresolvedAi.id,
      marketId: unresolvedAiMarket.id,
      userId: "creator_report_compare_trader_b",
      selectedOption: 1,
      stakeAmount: "17",
      placedAt: arenaTime(434),
    });

    const settledSports = await createLiveProposition(harness, {
      title: "Comparison settled sports proposition",
      createdByUserId: "creator_report_compare",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const [settledSportsTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledSports.id,
        userIds: ["creator_report_compare_participant_b"],
        assignedAt: arenaTime(435),
        expiresAt: arenaTime(445),
      });
    assert.ok(settledSportsTask);
    const settledSportsResponse = await harness.responseService.submitResponse({
      propositionId: settledSports.id,
      taskId: settledSportsTask.id,
      userId: "creator_report_compare_participant_b",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(435, 10),
      clientSubmittedAt: arenaTime(435, 20),
      understandingAck: true,
      submittedAt: arenaTime(435, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledSportsResponse.id,
      status: "partial_valid",
      reviewedAt: arenaTime(435, 30),
      reviewedByUserId: "reviewer_report_compare",
      qualityScore: 82,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.partial_valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledSports.id);
    const settledSportsMarket = await harness.marketRepository.findByPropositionId(
      settledSports.id,
    );
    assert.ok(settledSportsMarket);
    await harness.betService.placeBet({
      propositionId: settledSports.id,
      marketId: settledSportsMarket.id,
      userId: "creator_report_compare_trader_c",
      selectedOption: 1,
      stakeAmount: "31",
      placedAt: arenaTime(436),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledSports.id,
      now: arenaTime(437),
      updatedByUserId: "operator_report_compare",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledSports.id,
      settledAt: arenaTime(438),
    });

    const settledPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_compare",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled only",
          windowDays: 30,
          categories: [],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(settledPresetResponse.status, HttpStatus.CREATED);

    const aiPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_compare",
          roles: [SystemRole.User],
        },
        body: {
          name: "AI only",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(aiPresetResponse.status, HttpStatus.CREATED);

    const comparisonResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/analytics/compare?presetIds=${settledPresetResponse.body.presetId},${aiPresetResponse.body.presetId}&now=2026-04-18T12:00:00.000Z`,
      {
        user: {
          userId: "creator_report_compare",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(comparisonResponse.status, HttpStatus.OK);
    assertInternalIdentityAbsentRecursively(comparisonResponse.body);
    assert.equal(comparisonResponse.body.totalCount, 2);
    assert.equal(comparisonResponse.body.items.length, 2);
    assert.equal(
      comparisonResponse.body.items[0].preset.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(comparisonResponse.body.items[0].analytics.totals.createdCount, 2);
    assert.equal(comparisonResponse.body.items[0].analytics.totals.settledCount, 2);
    assert.equal(comparisonResponse.body.items[0].analytics.totals.unresolvedCount, 0);
    assert.equal(comparisonResponse.body.items[0].analytics.totals.totalBetCount, 2);
    assert.equal(
      comparisonResponse.body.items[0].analytics.totals.totalBetStakeAmount,
      "54",
    );
    assert.equal(
      comparisonResponse.body.items[1].preset.presetId,
      aiPresetResponse.body.presetId,
    );
    assert.equal(comparisonResponse.body.items[1].analytics.totals.createdCount, 2);
    assert.equal(comparisonResponse.body.items[1].analytics.totals.settledCount, 1);
    assert.equal(comparisonResponse.body.items[1].analytics.totals.unresolvedCount, 1);
    assert.equal(comparisonResponse.body.items[1].analytics.totals.totalBetCount, 2);
    assert.equal(
      comparisonResponse.body.items[1].analytics.totals.totalBetStakeAmount,
      "40",
    );
    assert.equal(comparisonResponse.body.items[1].analytics.categoryHistory.length, 1);
    assert.equal(
      comparisonResponse.body.items[1].analytics.categoryHistory[0].category,
      "ai",
    );
    assert.equal(comparisonResponse.body.summary.presetCount, 2);
    assert.equal(comparisonResponse.body.summary.topPresetByCreatedCount.presetId, settledPresetResponse.body.presetId);
    assert.equal(comparisonResponse.body.summary.topPresetByCreatedCount.createdCount, 2);
    assert.equal(comparisonResponse.body.summary.topPresetBySettledCount.presetId, settledPresetResponse.body.presetId);
    assert.equal(comparisonResponse.body.summary.topPresetBySettledCount.settledCount, 2);
    assert.equal(comparisonResponse.body.summary.topPresetByBetStakeAmount.presetId, settledPresetResponse.body.presetId);
    assert.equal(
      comparisonResponse.body.summary.topPresetByBetStakeAmount.totalBetStakeAmount,
      "54",
    );
    assert.equal(comparisonResponse.body.summary.totals.createdCount, 4);
    assert.equal(comparisonResponse.body.summary.totals.settledCount, 3);
    assert.equal(comparisonResponse.body.summary.totals.unresolvedCount, 1);
    assert.equal(comparisonResponse.body.summary.totals.totalEffectiveSampleCount, 3);
    assert.equal(comparisonResponse.body.summary.totals.totalReviewedResponseCount, 3);
    assert.equal(comparisonResponse.body.summary.totals.totalBetCount, 4);
    assert.equal(
      comparisonResponse.body.summary.totals.totalBetStakeAmount,
      "94",
    );
    assert.equal(comparisonResponse.body.summary.totals.uniqueTraderCount, 3);
  });
});

test("creator requester report preset comparison validation and ownership failures stay structured", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const invalidResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/analytics/compare",
      {
        user: {
          userId: "creator_report_compare_invalid",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(invalidResponse.status, HttpStatus.BAD_REQUEST);
    assert.equal(invalidResponse.body.success, false);
    assert.equal(invalidResponse.body.error.code, "VALIDATION_ERROR");

    const ownedPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_report_compare_owner",
          roles: [SystemRole.User],
        },
        body: {
          name: "Owned compare preset",
          windowDays: 14,
          categories: ["general"],
          marketEnabledOnly: true,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );

    assert.equal(ownedPresetResponse.status, HttpStatus.CREATED);

    const otherUserResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/analytics/compare?presetIds=${ownedPresetResponse.body.presetId}`,
      {
        user: {
          userId: "creator_report_compare_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserResponse.body.error.code,
      "requester_report_preset.not_found",
    );
  });
});

test("creator requester comparison set CRUD endpoints persist named preset collections", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const presetAResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
        body: {
          name: "AI only",
          windowDays: 21,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetAResponse.status, HttpStatus.CREATED);

    const presetBResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled only",
          windowDays: 30,
          categories: [],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetBResponse.status, HttpStatus.CREATED);

    const initialListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialListResponse.status, HttpStatus.OK);
    assert.equal(initialListResponse.body.totalCount, 0);
    assert.deepEqual(initialListResponse.body.items, []);

    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
        body: {
          name: "Requester cohort pack",
          description: "Saved requester comparison set.",
          presetIds: [
            presetAResponse.body.presetId,
            presetBResponse.body.presetId,
          ],
        },
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(createResponse.body);
    assert.equal(createResponse.body.name, "Requester cohort pack");
    assert.equal(
      createResponse.body.description,
      "Saved requester comparison set.",
    );
    assert.deepEqual(createResponse.body.presetIds, [
      presetAResponse.body.presetId,
      presetBResponse.body.presetId,
    ]);

    const listResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(
      listResponse.body.items[0].comparisonSetId,
      createResponse.body.comparisonSetId,
    );
    assert.deepEqual(listResponse.body.items[0].presetIds, [
      presetAResponse.body.presetId,
      presetBResponse.body.presetId,
    ]);

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${createResponse.body.comparisonSetId}`,
      {
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(
      detailResponse.body.comparisonSetId,
      createResponse.body.comparisonSetId,
    );
    assert.deepEqual(detailResponse.body.presetIds, [
      presetAResponse.body.presetId,
      presetBResponse.body.presetId,
    ]);

    const updateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${createResponse.body.comparisonSetId}`,
      {
        method: "PATCH",
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled first pack",
          presetIds: [
            presetBResponse.body.presetId,
            presetAResponse.body.presetId,
          ],
        },
      },
    );

    assert.equal(updateResponse.status, HttpStatus.OK);
    assert.equal(updateResponse.body.name, "Settled first pack");
    assert.deepEqual(updateResponse.body.presetIds, [
      presetBResponse.body.presetId,
      presetAResponse.body.presetId,
    ]);

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${createResponse.body.comparisonSetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(deleteResponse.status, HttpStatus.OK);
    assert.equal(
      deleteResponse.body.comparisonSetId,
      createResponse.body.comparisonSetId,
    );
    assert.equal(deleteResponse.body.deleted, true);

    const finalListResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        user: {
          userId: "creator_comparison_set",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(finalListResponse.status, HttpStatus.OK);
    assert.equal(finalListResponse.body.totalCount, 0);
    assert.deepEqual(finalListResponse.body.items, []);
  });
});

test("creator requester comparison sets enforce ownership and referenced-preset validation", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const ownerPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_owner",
          roles: [SystemRole.User],
        },
        body: {
          name: "Owner preset",
          windowDays: 14,
          categories: ["general"],
          marketEnabledOnly: false,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(ownerPresetResponse.status, HttpStatus.CREATED);

    const createResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_owner",
          roles: [SystemRole.User],
        },
        body: {
          name: "Owner comparison set",
          presetIds: [ownerPresetResponse.body.presetId],
        },
      },
    );
    assert.equal(createResponse.status, HttpStatus.CREATED);

    const invalidCreateResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_invalid",
          roles: [SystemRole.User],
        },
        body: {
          name: "Invalid comparison set",
          presetIds: [],
        },
      },
    );

    assert.equal(invalidCreateResponse.status, HttpStatus.BAD_REQUEST);
    assert.equal(invalidCreateResponse.body.success, false);
    assert.equal(invalidCreateResponse.body.error.code, "VALIDATION_ERROR");

    const foreignPresetCreateResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_other",
          roles: [SystemRole.User],
        },
        body: {
          name: "Foreign preset set",
          presetIds: [ownerPresetResponse.body.presetId],
        },
      },
    );

    assert.equal(foreignPresetCreateResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      foreignPresetCreateResponse.body.error.code,
      "requester_report_preset.not_found",
    );

    const otherUserDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${createResponse.body.comparisonSetId}`,
      {
        user: {
          userId: "creator_comparison_set_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDetailResponse.body.error.code,
      "requester_comparison_set.not_found",
    );

    const otherUserDeleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${createResponse.body.comparisonSetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_comparison_set_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDeleteResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDeleteResponse.body.error.code,
      "requester_comparison_set.not_found",
    );
  });
});

test("deleting a requester comparison set cascades delivery artifacts and stops future automation runs", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison set cascade settled AI proposition",
      createdByUserId: "creator_comparison_set_cascade",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_comparison_set_cascade_participant_a"],
        assignedAt: arenaTime(438),
        expiresAt: arenaTime(448),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_comparison_set_cascade_participant_a",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(438, 10),
      clientSubmittedAt: arenaTime(438, 20),
      understandingAck: true,
      submittedAt: arenaTime(438, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(438, 30),
      reviewedByUserId: "reviewer_comparison_set_cascade",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_comparison_set_cascade_trader_a",
      selectedOption: 1,
      stakeAmount: "29",
      placedAt: arenaTime(439),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(440),
      updatedByUserId: "operator_comparison_set_cascade",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(441),
    });

    const presetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
        body: {
          name: "Cascade preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
        body: {
          name: "Cascade comparison set",
          presetIds: [presetResponse.body.presetId],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const manualExportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(manualExportResponse.status, HttpStatus.CREATED);

    const policyResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
        body: {
          name: "Cascade delivery policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      },
    );
    assert.equal(policyResponse.status, HttpStatus.CREATED);

    const policyRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies/${policyResponse.body.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(policyRunResponse.status, HttpStatus.CREATED);

    await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
      "creator_comparison_set_cascade",
      comparisonSetResponse.body.comparisonSetId,
      policyResponse.body.policyId,
      {
        nextRunAt: "2026-04-18T12:00:00.000Z",
      },
    );

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deleteResponse.status, HttpStatus.OK);
    assert.equal(deleteResponse.body.deleted, true);

    const deletedExportDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${manualExportResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deletedExportDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      deletedExportDetailResponse.body.error.code,
      "requester_comparison_set.not_found",
    );

    const deletedPolicyListResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies`,
      {
        user: {
          userId: "creator_comparison_set_cascade",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deletedPolicyListResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      deletedPolicyListResponse.body.error.code,
      "requester_comparison_set.not_found",
    );

    const activeCascadeKeys = harness.store.systemKeyValues
      .filter((item) => item.deletedAt === null)
      .map((item) => item.key)
      .filter(
        (key) =>
          key.includes("creator_comparison_set_cascade") &&
          key.includes(comparisonSetResponse.body.comparisonSetId),
      );
    assert.deepEqual(activeCascadeKeys, []);

    const duePoliciesAfterDelete =
      await harness.requesterComparisonSetDeliveryPolicyService.listDuePolicies(
        "2026-04-18T12:05:00.000Z",
      );
    assert.equal(
      duePoliciesAfterDelete.some(
        (item) => item.policyId === policyResponse.body.policyId,
      ),
      false,
    );

    const automationAfterDelete =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-18T12:05:00.000Z",
      });
    assert.equal(automationAfterDelete.processedCount, 0);
    assert.equal(automationAfterDelete.failedCount, 0);
  });
});

test("creator requester comparison set analytics route reuses saved preset cohorts", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison set settled AI proposition",
      createdByUserId: "creator_comparison_set_analytics",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_comparison_set_analytics_participant_a"],
      assignedAt: arenaTime(440),
      expiresAt: arenaTime(450),
    });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_comparison_set_analytics_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(440, 10),
      clientSubmittedAt: arenaTime(440, 20),
      understandingAck: true,
      submittedAt: arenaTime(440, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(440, 30),
      reviewedByUserId: "reviewer_comparison_set_analytics",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_comparison_set_analytics_trader_a",
      selectedOption: 0,
      stakeAmount: "29",
      placedAt: arenaTime(441),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(442),
      updatedByUserId: "operator_comparison_set_analytics",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(443),
    });

    const liveSports = await createLiveProposition(harness, {
      title: "Comparison set live sports proposition",
      createdByUserId: "creator_comparison_set_analytics",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const liveSportsMarket = await harness.marketRepository.findByPropositionId(liveSports.id);
    assert.ok(liveSportsMarket);
    await harness.betService.placeBet({
      propositionId: liveSports.id,
      marketId: liveSportsMarket.id,
      userId: "creator_comparison_set_analytics_trader_b",
      selectedOption: 1,
      stakeAmount: "13",
      placedAt: arenaTime(444),
    });

    const settledPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_analytics",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled cohort",
          windowDays: 30,
          categories: [],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(settledPresetResponse.status, HttpStatus.CREATED);

    const sportsPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_analytics",
          roles: [SystemRole.User],
        },
        body: {
          name: "Sports cohort",
          windowDays: 30,
          categories: ["sports"],
          marketEnabledOnly: true,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(sportsPresetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_set_analytics",
          roles: [SystemRole.User],
        },
        body: {
          name: "Saved requester comparison",
          presetIds: [
            settledPresetResponse.body.presetId,
            sportsPresetResponse.body.presetId,
          ],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const comparisonResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/analytics?now=2026-04-18T12:00:00.000Z`,
      {
        user: {
          userId: "creator_comparison_set_analytics",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(comparisonResponse.status, HttpStatus.OK);
    assert.equal(
      comparisonResponse.body.comparisonSet.comparisonSetId,
      comparisonSetResponse.body.comparisonSetId,
    );
    assert.equal(comparisonResponse.body.totalCount, 2);
    assert.equal(comparisonResponse.body.items.length, 2);
    assert.equal(
      comparisonResponse.body.items[0].preset.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(comparisonResponse.body.items[0].analytics.totals.createdCount, 1);
    assert.equal(comparisonResponse.body.items[0].analytics.totals.settledCount, 1);
    assert.equal(comparisonResponse.body.items[0].analytics.totals.totalBetStakeAmount, "29");
    assert.equal(
      comparisonResponse.body.items[1].preset.presetId,
      sportsPresetResponse.body.presetId,
    );
    assert.equal(comparisonResponse.body.items[1].analytics.totals.createdCount, 1);
    assert.equal(comparisonResponse.body.items[1].analytics.totals.unresolvedCount, 1);
    assert.equal(comparisonResponse.body.items[1].analytics.totals.totalBetStakeAmount, "13");
  });
});

test("creator requester comparison set exports create, list, and detail persisted delivery artifacts", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison export settled AI proposition",
      createdByUserId: "creator_comparison_export",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_comparison_export_participant_a"],
      assignedAt: arenaTime(450),
      expiresAt: arenaTime(460),
    });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_comparison_export_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(450, 10),
      clientSubmittedAt: arenaTime(450, 20),
      understandingAck: true,
      submittedAt: arenaTime(450, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(450, 30),
      reviewedByUserId: "reviewer_comparison_export",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_comparison_export_trader_a",
      selectedOption: 0,
      stakeAmount: "33",
      placedAt: arenaTime(451),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(452),
      updatedByUserId: "operator_comparison_export",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(453),
    });

    const liveSports = await createLiveProposition(harness, {
      title: "Comparison export live sports proposition",
      createdByUserId: "creator_comparison_export",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    const liveSportsMarket = await harness.marketRepository.findByPropositionId(liveSports.id);
    assert.ok(liveSportsMarket);
    await harness.betService.placeBet({
      propositionId: liveSports.id,
      marketId: liveSportsMarket.id,
      userId: "creator_comparison_export_trader_b",
      selectedOption: 1,
      stakeAmount: "14",
      placedAt: arenaTime(454),
    });

    const settledPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
        body: {
          name: "Settled export preset",
          windowDays: 30,
          categories: [],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(settledPresetResponse.status, HttpStatus.CREATED);

    const sportsPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
        body: {
          name: "Sports export preset",
          windowDays: 30,
          categories: ["sports"],
          marketEnabledOnly: true,
          statusScope: "all",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(sportsPresetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
        body: {
          name: "Saved exportable comparison",
          presetIds: [
            settledPresetResponse.body.presetId,
            sportsPresetResponse.body.presetId,
          ],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const initialListResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialListResponse.status, HttpStatus.OK);
    assert.equal(initialListResponse.body.totalCount, 0);
    assert.deepEqual(initialListResponse.body.items, []);

    const createResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assertInternalIdentityAbsentRecursively(createResponse.body);
    assert.equal(
      createResponse.body.comparisonSet.comparisonSetId,
      comparisonSetResponse.body.comparisonSetId,
    );
    assert.equal(createResponse.body.status, "completed");
    assert.equal(createResponse.body.totalCount, 2);
    assert.equal(createResponse.body.items.length, 2);
    assert.equal(createResponse.body.origin.type, "manual");
    assert.equal(createResponse.body.origin.policyId, null);
    assert.equal(createResponse.body.origin.policyName, null);
    assert.equal(
      createResponse.body.items[0].preset.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(createResponse.body.items[0].analytics.totals.totalBetStakeAmount, "33");

    const listResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.storedCount, 1);
    assert.equal(listResponse.body.appliedFilters.origin, null);
    assert.equal(listResponse.body.appliedFilters.policyId, null);
    assert.equal(listResponse.body.appliedFilters.limit, null);
    assert.equal(listResponse.body.items[0].exportId, createResponse.body.exportId);
    assert.equal(listResponse.body.items[0].origin.type, "manual");
    assert.equal(
      listResponse.body.items[0].comparisonSet.comparisonSetId,
      comparisonSetResponse.body.comparisonSetId,
    );

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.exportId, createResponse.body.exportId);
    assert.equal(
      detailResponse.body.comparisonSet.comparisonSetId,
      comparisonSetResponse.body.comparisonSetId,
    );
    assert.equal(detailResponse.body.totalCount, 2);
    assert.equal(detailResponse.body.origin.type, "manual");
    assert.equal(detailResponse.body.origin.policyId, null);
    assert.equal(detailResponse.body.origin.policyName, null);
    assert.equal(detailResponse.body.summary.presetCount, 2);
    assert.equal(detailResponse.body.summary.topPresetByCreatedCount.presetId, settledPresetResponse.body.presetId);
    assert.equal(detailResponse.body.summary.topPresetByCreatedCount.createdCount, 1);
    assert.equal(detailResponse.body.summary.topPresetBySettledCount.presetId, settledPresetResponse.body.presetId);
    assert.equal(detailResponse.body.summary.topPresetBySettledCount.settledCount, 1);
    assert.equal(detailResponse.body.summary.topPresetByBetStakeAmount.presetId, settledPresetResponse.body.presetId);
    assert.equal(
      detailResponse.body.summary.topPresetByBetStakeAmount.totalBetStakeAmount,
      "33",
    );
    assert.equal(detailResponse.body.summary.totals.createdCount, 2);
    assert.equal(detailResponse.body.summary.totals.settledCount, 1);
    assert.equal(detailResponse.body.summary.totals.unresolvedCount, 1);
    assert.equal(detailResponse.body.summary.totals.totalEffectiveSampleCount, 1);
    assert.equal(detailResponse.body.summary.totals.totalReviewedResponseCount, 1);
    assert.equal(detailResponse.body.summary.totals.totalBetCount, 2);
    assert.equal(detailResponse.body.summary.totals.totalBetStakeAmount, "47");
    assert.equal(detailResponse.body.summary.totals.uniqueTraderCount, 2);
    assert.equal(detailResponse.body.report.generatedAt, detailResponse.body.completedAt);
    assert.equal(detailResponse.body.report.presetCount, 2);
    assert.equal(detailResponse.body.report.totals.totalBetStakeAmount, "47");
    assert.equal(
      detailResponse.body.report.leaders.byCreatedCount.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(
      detailResponse.body.report.leaders.byCreatedCount.name,
      "Settled export preset",
    );
    assert.equal(
      detailResponse.body.report.leaders.byBetStakeAmount.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(
      detailResponse.body.report.leaders.byBetStakeAmount.totalBetStakeAmount,
      "33",
    );
    assert.equal(detailResponse.body.report.rows.length, 2);
    assert.equal(detailResponse.body.report.rows[0].rank, 1);
    assert.equal(
      detailResponse.body.report.rows[0].preset.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(detailResponse.body.report.rows[0].settledCount, 1);
    assert.equal(detailResponse.body.report.rows[0].totalBetStakeAmount, "33");
    assert.equal(detailResponse.body.report.rows[1].rank, 2);
    assert.equal(
      detailResponse.body.report.rows[1].preset.presetId,
      sportsPresetResponse.body.presetId,
    );
    assert.equal(detailResponse.body.report.rows[1].unresolvedCount, 1);
    assert.equal(detailResponse.body.report.rows[1].totalBetStakeAmount, "14");

    const legacyComparisonStorageKey = `arena.requester.comparison_set_exports.creator_comparison_export.${comparisonSetResponse.body.comparisonSetId}`;
    await harness.systemKeyValueRepository.upsertByKey(
      legacyComparisonStorageKey,
      {
        id: "system_key_value_legacy_comparison_export",
        key: legacyComparisonStorageKey,
        description: "Legacy requester comparison export fixture",
        valueJson: [
          {
            exportId: createResponse.body.exportId,
            userId: "creator_comparison_export",
            status: createResponse.body.status,
            format: createResponse.body.format,
            requestedAt: createResponse.body.requestedAt,
            completedAt: createResponse.body.completedAt,
            fileName: createResponse.body.fileName,
            origin: createResponse.body.origin,
            comparisonSet: createResponse.body.comparisonSet,
            totalCount: createResponse.body.totalCount,
            summary: createResponse.body.summary,
            items: createResponse.body.items,
          },
        ],
      },
      {
        valueJson: [
          {
            exportId: createResponse.body.exportId,
            userId: "creator_comparison_export",
            status: createResponse.body.status,
            format: createResponse.body.format,
            requestedAt: createResponse.body.requestedAt,
            completedAt: createResponse.body.completedAt,
            fileName: createResponse.body.fileName,
            origin: createResponse.body.origin,
            comparisonSet: createResponse.body.comparisonSet,
            totalCount: createResponse.body.totalCount,
            summary: createResponse.body.summary,
            items: createResponse.body.items,
          },
        ],
      },
    );

    const legacyDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(legacyDetailResponse.status, HttpStatus.OK);
    assert.equal(
      legacyDetailResponse.body.report.generatedAt,
      createResponse.body.completedAt,
    );
    assert.equal(legacyDetailResponse.body.report.rows.length, 2);
    assert.equal(
      legacyDetailResponse.body.report.leaders.bySettledCount.presetId,
      settledPresetResponse.body.presetId,
    );
    assert.equal(
      legacyDetailResponse.body.report.rows[0].preset.presetId,
      settledPresetResponse.body.presetId,
    );

    const otherUserDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(otherUserDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDetailResponse.body.error.code,
      "requester_comparison_set.not_found",
    );
  });
});

test("creator requester comparison set exports can persist csv artifacts when explicitly requested", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison export CSV settled AI proposition",
      createdByUserId: "creator_comparison_export_csv",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_comparison_export_csv_participant_a"],
        assignedAt: arenaTime(454, 10),
        expiresAt: arenaTime(454, 20),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_comparison_export_csv_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(454, 11),
      clientSubmittedAt: arenaTime(454, 12),
      understandingAck: true,
      submittedAt: arenaTime(454, 12),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(454, 13),
      reviewedByUserId: "reviewer_comparison_export_csv",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_comparison_export_csv_trader_a",
      selectedOption: 0,
      stakeAmount: "17",
      placedAt: arenaTime(454, 14),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(454, 15),
      updatedByUserId: "operator_comparison_export_csv",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(454, 16),
    });

    const settledPresetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_csv",
          roles: [SystemRole.User],
        },
        body: {
          name: "CSV comparison preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(settledPresetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_csv",
          roles: [SystemRole.User],
        },
        body: {
          name: "CSV comparison export set",
          presetIds: [settledPresetResponse.body.presetId],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const createResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_csv",
          roles: [SystemRole.User],
        },
        body: {
          format: "csv",
        },
      },
    );

    assert.equal(createResponse.status, HttpStatus.CREATED);
    assert.equal(createResponse.body.format, "csv");
    assert.equal(createResponse.body.fileName.endsWith(".csv"), true);
    assert.equal(createResponse.body.serialized.mediaType, "text/csv");
    assert.match(
      createResponse.body.serialized.content,
      /rank,presetId,presetName,createdCount,settledCount,unresolvedCount,totalEffectiveSampleCount,totalReviewedResponseCount,totalBetCount,totalBetStakeAmount,uniqueTraderCount/u,
    );
    assert.match(
      createResponse.body.serialized.content,
      /CSV comparison preset/u,
    );

    const listResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_comparison_export_csv",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.items[0].format, "csv");
    assert.equal(listResponse.body.items[0].fileName.endsWith(".csv"), true);

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${createResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export_csv",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.format, "csv");
    assert.equal(detailResponse.body.serialized.mediaType, "text/csv");
    assert.equal(
      detailResponse.body.serialized.content,
      createResponse.body.serialized.content,
    );
    assert.equal(detailResponse.body.report.rows.length, 1);
  });
});

test("deleting a requester comparison set export removes only the targeted artifact and preserves the export substrate", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Comparison export delete settled AI proposition",
      createdByUserId: "creator_comparison_export_delete",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_comparison_export_delete_participant_a"],
        assignedAt: arenaTime(455),
        expiresAt: arenaTime(465),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_comparison_export_delete_participant_a",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(455, 10),
      clientSubmittedAt: arenaTime(455, 20),
      understandingAck: true,
      submittedAt: arenaTime(455, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(455, 30),
      reviewedByUserId: "reviewer_comparison_export_delete",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_comparison_export_delete_trader_a",
      selectedOption: 1,
      stakeAmount: "27",
      placedAt: arenaTime(456),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(457),
      updatedByUserId: "operator_comparison_export_delete",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(458),
    });

    const presetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
        body: {
          name: "Delete export preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
        body: {
          name: "Delete export comparison set",
          presetIds: [presetResponse.body.presetId],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const firstExportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(firstExportResponse.status, HttpStatus.CREATED);

    const secondExportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(secondExportResponse.status, HttpStatus.CREATED);

    const otherUserDeleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${firstExportResponse.body.exportId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_comparison_export_delete_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherUserDeleteResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDeleteResponse.body.error.code,
      "requester_comparison_set.not_found",
    );

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${firstExportResponse.body.exportId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deleteResponse.status, HttpStatus.OK);
    assert.equal(deleteResponse.body.deleted, true);
    assertInternalIdentityAbsentRecursively(deleteResponse.body);
    assert.equal(deleteResponse.body.comparisonSetId, comparisonSetResponse.body.comparisonSetId);
    assert.equal(deleteResponse.body.exportId, firstExportResponse.body.exportId);

    const deletedDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${firstExportResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deletedDetailResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      deletedDetailResponse.body.error.code,
      "requester_comparison_set_export.not_found",
    );

    const remainingDetailResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports/${secondExportResponse.body.exportId}`,
      {
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(remainingDetailResponse.status, HttpStatus.OK);
    assert.equal(
      remainingDetailResponse.body.exportId,
      secondExportResponse.body.exportId,
    );

    const listResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 1);
    assert.equal(listResponse.body.storedCount, 1);
    assert.equal(
      listResponse.body.items[0].exportId,
      secondExportResponse.body.exportId,
    );

    const recreatedExportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(recreatedExportResponse.status, HttpStatus.CREATED);

    const postRecreateListResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_comparison_export_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(postRecreateListResponse.status, HttpStatus.OK);
    assert.equal(postRecreateListResponse.body.totalCount, 2);
    assert.equal(postRecreateListResponse.body.storedCount, 2);

    const activeExportKeys = harness.store.systemKeyValues
      .filter((item) => item.deletedAt === null)
      .map((item) => item.key)
      .filter(
        (key) =>
          key.includes("creator_comparison_export_delete") &&
          key.includes(comparisonSetResponse.body.comparisonSetId) &&
          key.includes("comparison_set_exports"),
      );
    assert.equal(activeExportKeys.length, 1);
  });
});

test("deleting a retained comparison export makes delivery health and retry availability reflect the missing artifact", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Delete retained export delivery truth proposition",
      createdByUserId: "creator_delivery_export_delete",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_export_delete_participant_a"],
        assignedAt: arenaTime(459),
        expiresAt: arenaTime(469),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_export_delete_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(459, 10),
      clientSubmittedAt: arenaTime(459, 20),
      understandingAck: true,
      submittedAt: arenaTime(459, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(459, 30),
      reviewedByUserId: "reviewer_delivery_export_delete",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_export_delete_trader_a",
      selectedOption: 0,
      stakeAmount: "29",
      placedAt: arenaTime(460),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(461),
      updatedByUserId: "operator_delivery_export_delete",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(462),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_export_delete",
      {
        name: "Delete retained export preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_export_delete",
        {
          name: "Delete retained export comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_export_delete",
        comparisonSet.comparisonSetId,
        {
          name: "Delete retained export policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          retainedExportCount: 5,
        },
      );
    const transportBehavior = {
      statusCode: 500,
      responseBody: { ok: false },
    };
    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(
      deliveries,
      transportBehavior,
    );

    try {
      await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
        "creator_delivery_export_delete",
        comparisonSet.comparisonSetId,
        policy.policyId,
        {
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/delete-retained-export`,
          },
        },
      );

      const failedRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );
      assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);
      assert.equal(
        failedRunResponse.body.error.code,
        "requester_comparison_set_delivery.transport_failed",
      );

      const failedRunsBeforeDelete = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
        {
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(failedRunsBeforeDelete.status, HttpStatus.OK);
      assert.equal(failedRunsBeforeDelete.body.totalCount, 1);
      assert.equal(
        failedRunsBeforeDelete.body.items[0].retainedExportAvailable,
        true,
      );
      const preservedExportId = failedRunsBeforeDelete.body.items[0].exportId;
      assert.equal(typeof preservedExportId, "string");

      const deleteResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports/${preservedExportId}`,
        {
          method: "DELETE",
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(deleteResponse.status, HttpStatus.OK);
      assert.equal(deleteResponse.body.deleted, true);

      const runsAfterDelete = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(runsAfterDelete.status, HttpStatus.OK);
      assert.equal(runsAfterDelete.body.totalCount, 1);
      assert.equal(runsAfterDelete.body.items[0].exportId, preservedExportId);
      assert.equal(runsAfterDelete.body.items[0].retainedExportAvailable, false);

      const healthAfterDelete = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:20:00.000Z`,
        {
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(healthAfterDelete.status, HttpStatus.OK);
      assert.equal(
        healthAfterDelete.body.health.latestRun.exportId,
        preservedExportId,
      );
      assert.equal(
        healthAfterDelete.body.health.latestRun.retainedExportAvailable,
        false,
      );

      const retryAfterDelete = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs/${runsAfterDelete.body.items[0].runId}/retry`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_export_delete",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );
      assert.equal(retryAfterDelete.status, HttpStatus.CONFLICT);
      assert.equal(
        retryAfterDelete.body.error.code,
        "requester_comparison_set_delivery_run.retry_export_unavailable",
      );
    } finally {
      await webhookServer.close();
    }
  });
});

test("creator requester comparison set delivery policy CRUD and manual run create recurring export substrate", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Policy settled AI proposition",
      createdByUserId: "creator_delivery_policy",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_delivery_policy_participant_a"],
      assignedAt: arenaTime(460),
      expiresAt: arenaTime(470),
    });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_policy_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(460, 10),
      clientSubmittedAt: arenaTime(460, 20),
      understandingAck: true,
      submittedAt: arenaTime(460, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(460, 30),
      reviewedByUserId: "reviewer_delivery_policy",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_policy_trader_a",
      selectedOption: 0,
      stakeAmount: "18",
      placedAt: arenaTime(461),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(462),
      updatedByUserId: "operator_delivery_policy",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(463),
    });

    const presetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/report-presets",
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy",
          roles: [SystemRole.User],
        },
        body: {
          name: "Policy preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      },
    );
    assert.equal(presetResponse.status, HttpStatus.CREATED);

    const comparisonSetResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/comparison-sets",
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy",
          roles: [SystemRole.User],
        },
        body: {
          name: "Policy comparison set",
          presetIds: [presetResponse.body.presetId],
        },
      },
    );
    assert.equal(comparisonSetResponse.status, HttpStatus.CREATED);

    const initialListResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies`,
      {
        user: {
          userId: "creator_delivery_policy",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialListResponse.status, HttpStatus.OK);
    assert.equal(initialListResponse.body.totalCount, 0);
    assert.deepEqual(initialListResponse.body.items, []);

    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const deliveredHeaders: Array<Record<string, string | string[] | undefined>> =
      [];
    const webhookServer = await createWebhookCaptureServer(deliveries);

    try {
      const createResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy",
          roles: [SystemRole.User],
        },
        body: {
          name: "Daily comparison export",
          description: "Recurring requester delivery policy.",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/requester-delivery`,
            credentialKey: "delivery_policy",
          },
        },
      },
    );

      assert.equal(createResponse.status, HttpStatus.CREATED);
      assertInternalIdentityAbsentRecursively(createResponse.body);
      assert.equal(createResponse.body.name, "Daily comparison export");
      assert.equal(createResponse.body.cadence, "daily");
      assert.equal(createResponse.body.enabled, true);
      assert.equal(createResponse.body.transport.type, "webhook");
      assert.equal(
        createResponse.body.transport.targetUrl,
        `${webhookServer.baseUrl}/requester-delivery`,
      );
      assert.equal(
        createResponse.body.transport.credentialKey,
        "delivery_policy",
      );

      const listResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies`,
        {
          user: {
            userId: "creator_delivery_policy",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(listResponse.status, HttpStatus.OK);
      assert.equal(listResponse.body.totalCount, 1);
      assert.equal(
        listResponse.body.items[0].policyId,
        createResponse.body.policyId,
      );
      assert.equal(listResponse.body.items[0].transport.type, "webhook");
      assert.equal(
        listResponse.body.items[0].transport.credentialKey,
        "delivery_policy",
      );

      const runResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSetResponse.body.comparisonSetId}/delivery-policies/${createResponse.body.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_policy",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(runResponse.status, HttpStatus.CREATED);
      assert.equal(runResponse.body.policy.policyId, createResponse.body.policyId);
      assert.equal(typeof runResponse.body.run.runId, "string");
      assert.equal(runResponse.body.run.retriedRunId, null);
      assert.equal(runResponse.body.run.triggerType, "manual");
      assert.equal(runResponse.body.run.exportId, runResponse.body.export.exportId);
      assert.equal(runResponse.body.export.status, "completed");
      assert.equal(runResponse.body.export.totalCount, 1);
      assert.equal(runResponse.body.export.origin.type, "delivery_policy_manual");
      assert.equal(
        runResponse.body.export.origin.policyId,
        createResponse.body.policyId,
      );
      assert.equal(
        runResponse.body.export.origin.policyName,
        "Daily comparison export",
      );
      assert.equal(runResponse.body.policy.lastRunAt !== null, true);
      assert.equal(runResponse.body.policy.nextRunAt, "2026-04-19T12:00:00.000Z");
      assert.equal(runResponse.body.delivery.statusCode, 200);
      assert.equal(runResponse.body.delivery.deliveredAt !== null, true);
      assert.equal(
        runResponse.body.delivery.authentication.kind,
        "bearer",
      );
      assert.equal(
        runResponse.body.delivery.authentication.credentialKey,
        "delivery_policy",
      );
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].path, "/requester-delivery");
      assert.equal(deliveries[0].body.policy.policyId, createResponse.body.policyId);
      assert.equal(
        deliveries[0].body.export.exportId,
        runResponse.body.export.exportId,
      );
      assert.equal(
        deliveries[0].body.export.report.rows[0].preset.name,
        "Policy preset",
      );
    } finally {
      await webhookServer.close();
    }
  });
});

test("requester delivery credential directory route lists safe configured bindings without exposing secrets", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/propositions/mine/delivery-credentials",
      {
        user: {
          userId: "creator_delivery_credentials",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.deepEqual(response.body, {
      totalCount: 3,
      items: [
        {
          credentialKey: "automation_delivery",
          label: "automation_delivery",
          transportType: "webhook",
          authenticationKind: "bearer",
        },
        {
          credentialKey: "delivery_policy",
          label: "delivery_policy",
          transportType: "webhook",
          authenticationKind: "bearer",
        },
        {
          credentialKey: "retry_delivery",
          label: "retry_delivery",
          transportType: "webhook",
          authenticationKind: "bearer",
        },
      ],
    });
  });
});

test("requester comparison set delivery policy health surfaces missing webhook credential configuration", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_transport_health",
      {
        name: "Transport health preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_transport_health",
        {
          name: "Transport health comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
      "creator_delivery_transport_health",
      comparisonSet.comparisonSetId,
      {
        name: "Transport health policy",
        cadence: "daily",
        nextRunAt: "2026-04-18T12:00:00.000Z",
        enabled: true,
        transport: {
          type: "webhook",
          targetUrl: "https://example.test/requester-delivery",
          credentialKey: "missing_key",
        },
      },
    );

    const response = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:05:00.000Z`,
      {
        user: {
          userId: "creator_delivery_transport_health",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.health.transport.status, "blocked");
    assert.equal(
      response.body.health.transport.blockingReason,
      "transport_credential_missing",
    );
    assert.equal(
      response.body.health.transport.credentialKey,
      "missing_key",
    );
  });
});

test("requester comparison set delivery policies support explicit pause and resume actions", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_pause_resume",
      {
        name: "Pause resume preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_pause_resume",
        {
          name: "Pause resume comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_pause_resume",
        comparisonSet.comparisonSetId,
        {
          name: "Pause resume policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );

    const pauseResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/pause`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_pause_resume",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(pauseResponse.status, HttpStatus.OK);
    assert.equal(pauseResponse.body.policyId, policy.policyId);
    assert.equal(pauseResponse.body.enabled, false);

    const pausedHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:05:00.000Z`,
      {
        user: {
          userId: "creator_delivery_pause_resume",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(pausedHealthResponse.status, HttpStatus.OK);
    assert.equal(pausedHealthResponse.body.policy.enabled, false);
    assert.equal(pausedHealthResponse.body.health.status, "disabled");
    assert.equal(pausedHealthResponse.body.health.isDue, false);

    const dueWhilePaused =
      await harness.requesterComparisonSetDeliveryPolicyService.listDuePolicies(
        "2026-04-18T12:05:00.000Z",
      );
    assert.equal(
      dueWhilePaused.some((item) => item.policyId === policy.policyId),
      false,
    );

    const resumeResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/resume`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_pause_resume",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(resumeResponse.status, HttpStatus.OK);
    assert.equal(resumeResponse.body.policyId, policy.policyId);
    assert.equal(resumeResponse.body.enabled, true);

    const resumedHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:05:00.000Z`,
      {
        user: {
          userId: "creator_delivery_pause_resume",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(resumedHealthResponse.status, HttpStatus.OK);
    assert.equal(resumedHealthResponse.body.policy.enabled, true);
    assert.equal(resumedHealthResponse.body.health.status, "due");
    assert.equal(resumedHealthResponse.body.health.isDue, true);

    const dueAfterResume =
      await harness.requesterComparisonSetDeliveryPolicyService.listDuePolicies(
        "2026-04-18T12:05:00.000Z",
      );
    assert.equal(
      dueAfterResume.some((item) => item.policyId === policy.policyId),
      true,
    );
  });
});

test("requester comparison set delivery pause and resume conflicts stay structured", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_pause_conflict",
      {
        name: "Pause conflict preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_pause_conflict",
        {
          name: "Pause conflict comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_pause_conflict",
        comparisonSet.comparisonSetId,
        {
          name: "Pause conflict policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );

    await harness.requesterComparisonSetDeliveryPolicyService.pausePolicyForUser(
      "creator_delivery_pause_conflict",
      comparisonSet.comparisonSetId,
      policy.policyId,
    );

    const repeatPauseResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/pause`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_pause_conflict",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(repeatPauseResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      repeatPauseResponse.body.error.code,
      "requester_comparison_set_delivery_policy.pause.already_paused",
    );

    const otherUserResumeResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/resume`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_pause_conflict_other",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(otherUserResumeResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserResumeResponse.body.error.code,
      "requester_comparison_set_delivery_policy.not_found",
    );

    await harness.requesterComparisonSetDeliveryPolicyService.resumePolicyForUser(
      "creator_delivery_pause_conflict",
      comparisonSet.comparisonSetId,
      policy.policyId,
    );

    const repeatResumeResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/resume`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_pause_conflict",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(repeatResumeResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      repeatResumeResponse.body.error.code,
      "requester_comparison_set_delivery_policy.resume.not_paused",
    );
  });
});

test("requester comparison set delivery automation runs due policies and materializes exports", async () => {
  await withHttpArenaApp(async ({ harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Automated delivery settled AI proposition",
      createdByUserId: "creator_delivery_automation",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settledAi.id,
      userIds: ["creator_delivery_automation_participant_a"],
      assignedAt: arenaTime(470),
      expiresAt: arenaTime(480),
    });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_automation_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(470, 10),
      clientSubmittedAt: arenaTime(470, 20),
      understandingAck: true,
      submittedAt: arenaTime(470, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(470, 30),
      reviewedByUserId: "reviewer_delivery_automation",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(settledAi.id);
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_automation_trader_a",
      selectedOption: 0,
      stakeAmount: "26",
      placedAt: arenaTime(471),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(472),
      updatedByUserId: "operator_delivery_automation",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(473),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_automation",
      {
        name: "Automation preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_automation",
        {
          name: "Automation comparison set",
          presetIds: [preset.presetId],
        },
      );

    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(deliveries);

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_automation",
        comparisonSet.comparisonSetId,
        {
          name: "Due delivery policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/automation-delivery`,
          },
        },
      );

      const result =
        await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
          now: "2026-04-18T12:05:00.000Z",
        });

      assert.equal(result.processedCount, 1);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].policyId, policy.policyId);
      assert.equal(result.items[0].export.status, "completed");
      assert.equal(
        result.items[0].export.origin.type,
        "delivery_policy_automation",
      );
      assert.equal(result.items[0].export.origin.policyId, policy.policyId);
      assert.equal(
        result.items[0].export.origin.policyName,
        "Due delivery policy",
      );
      assert.equal(result.items[0].delivery?.statusCode, 200);
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].path, "/automation-delivery");
      assert.equal(deliveries[0].body.policy.policyId, policy.policyId);
      assert.equal(
        deliveries[0].body.export.origin.type,
        "delivery_policy_automation",
      );

      const exports =
        await harness.requesterPropositionViewService.listOwnedComparisonSetExports({
          userId: "creator_delivery_automation",
          comparisonSetId: comparisonSet.comparisonSetId,
        });

      assert.equal(exports.totalCount, 1);
      assert.equal(
        exports.items[0].comparisonSet.comparisonSetId,
        comparisonSet.comparisonSetId,
      );
      assert.equal(exports.items[0].origin.type, "delivery_policy_automation");
      assert.equal(exports.items[0].origin.policyId, policy.policyId);
    } finally {
      await webhookServer.close();
    }
  });
});

test("requester comparison set delivery runs persist manual and automation run history", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Run history settled AI proposition",
      createdByUserId: "creator_delivery_runs",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_runs_participant_a"],
        assignedAt: arenaTime(500),
        expiresAt: arenaTime(510),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_runs_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(500, 10),
      clientSubmittedAt: arenaTime(500, 20),
      understandingAck: true,
      submittedAt: arenaTime(500, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(500, 30),
      reviewedByUserId: "reviewer_delivery_runs",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_runs_trader_a",
      selectedOption: 0,
      stakeAmount: "24",
      placedAt: arenaTime(501),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(502),
      updatedByUserId: "operator_delivery_runs",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(503),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_runs",
      {
        name: "Run history preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_runs",
        {
          name: "Run history comparison set",
          presetIds: [preset.presetId],
        },
      );

    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(deliveries, {
      statusCode: 202,
      responseBody: { accepted: true },
    });

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_runs",
        comparisonSet.comparisonSetId,
        {
          name: "Run history policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/requester-run-history`,
          },
        },
      );

      const manualRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_runs",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );
      assert.equal(manualRunResponse.status, HttpStatus.CREATED);
      assert.equal(manualRunResponse.body.export.origin.type, "delivery_policy_manual");

      await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
        "creator_delivery_runs",
        comparisonSet.comparisonSetId,
        policy.policyId,
        {
          nextRunAt: "2026-04-19T12:00:00.000Z",
        },
      );

      const automationResult =
        await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
          now: "2026-04-19T12:05:00.000Z",
        });
      assert.equal(automationResult.processedCount, 1);
      assert.equal(
        automationResult.items[0].export.origin.type,
        "delivery_policy_automation",
      );

      const runsResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_runs",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(runsResponse.status, HttpStatus.OK);
      assertInternalIdentityAbsentRecursively(runsResponse.body);
      assert.equal(runsResponse.body.comparisonSetId, comparisonSet.comparisonSetId);
      assert.equal(runsResponse.body.policyId, policy.policyId);
      assert.equal(runsResponse.body.totalCount, 2);
      assert.equal(runsResponse.body.storedCount, 2);
      assert.equal(runsResponse.body.appliedFilters.status, null);
      assert.equal(runsResponse.body.appliedFilters.triggerType, null);
      assert.equal(runsResponse.body.appliedFilters.replay, "all");
      assert.equal(runsResponse.body.appliedFilters.limit, null);
      assert.equal(runsResponse.body.items.length, 2);
      assert.deepEqual(
        [...runsResponse.body.items]
          .map((item: { triggerType: string }) => item.triggerType)
          .sort(),
        ["automation", "manual"],
      );
      assert.equal(
        Date.parse(runsResponse.body.items[0].completedAt) >=
          Date.parse(runsResponse.body.items[1].completedAt),
        true,
      );
      assert.equal(
        runsResponse.body.items.every(
          (item: { status: string }) => item.status === "completed",
        ),
        true,
      );
      const automationRun = runsResponse.body.items.find(
        (item: { triggerType: string }) => item.triggerType === "automation",
      );
      const manualRun = runsResponse.body.items.find(
        (item: { triggerType: string }) => item.triggerType === "manual",
      );
      assert.ok(automationRun);
      assert.ok(manualRun);
      assert.equal(
        automationRun.exportId,
        automationResult.items[0].export.exportId,
      );
      assert.equal(
        automationRun.origin.type,
        "delivery_policy_automation",
      );
      assert.equal(
        manualRun.exportId,
        manualRunResponse.body.export.exportId,
      );
      assert.equal(
        manualRun.origin.type,
        "delivery_policy_manual",
      );
      assert.deepEqual(manualRun.delivery, manualRunResponse.body.delivery);
      assert.deepEqual(automationRun.delivery, automationResult.items[0].delivery);
      assert.equal(
        runsResponse.body.items.every(
          (item: {
            startedAt: string;
            completedAt: string;
            comparisonSetId: string;
            policyId: string;
          }) =>
            typeof item.startedAt === "string" &&
            typeof item.completedAt === "string" &&
            item.comparisonSetId === comparisonSet.comparisonSetId &&
            item.policyId === policy.policyId,
        ),
        true,
      );
      assert.equal(deliveries.length, 2);
      assert.equal(deliveries[0].path, "/requester-run-history");
      assert.equal(deliveries[1].path, "/requester-run-history");

      const automationOnlyResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?triggerType=automation`,
        {
          user: {
            userId: "creator_delivery_runs",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(automationOnlyResponse.status, HttpStatus.OK);
      assert.equal(automationOnlyResponse.body.totalCount, 1);
      assert.equal(automationOnlyResponse.body.storedCount, 2);
      assert.equal(automationOnlyResponse.body.appliedFilters.triggerType, "automation");
      assert.equal(automationOnlyResponse.body.items[0].triggerType, "automation");

      const freshOnlyResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?replay=fresh_only&limit=1`,
        {
          user: {
            userId: "creator_delivery_runs",
            roles: [SystemRole.User],
          },
        },
      );
      assert.equal(freshOnlyResponse.status, HttpStatus.OK);
      assert.equal(freshOnlyResponse.body.totalCount, 1);
      assert.equal(freshOnlyResponse.body.storedCount, 2);
      assert.equal(freshOnlyResponse.body.appliedFilters.replay, "fresh_only");
      assert.equal(freshOnlyResponse.body.appliedFilters.limit, 1);
      assert.equal(freshOnlyResponse.body.items.length, 1);
      assert.equal(freshOnlyResponse.body.items[0].retriedRunId, null);
    } finally {
      await webhookServer.close();
    }
  });
});

test("requester comparison set delivery run history is owner scoped and policy scoped", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Scoped run history settled AI proposition",
      createdByUserId: "creator_delivery_runs_scope",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_runs_scope_participant_a"],
        assignedAt: arenaTime(510),
        expiresAt: arenaTime(520),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_runs_scope_participant_a",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(510, 10),
      clientSubmittedAt: arenaTime(510, 20),
      understandingAck: true,
      submittedAt: arenaTime(510, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(510, 30),
      reviewedByUserId: "reviewer_delivery_runs_scope",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_runs_scope_trader_a",
      selectedOption: 1,
      stakeAmount: "28",
      placedAt: arenaTime(511),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(512),
      updatedByUserId: "operator_delivery_runs_scope",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(513),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_runs_scope",
      {
        name: "Scoped run history preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_runs_scope",
        {
          name: "Scoped run history comparison set",
          presetIds: [preset.presetId],
        },
      );

    const firstPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_runs_scope",
        comparisonSet.comparisonSetId,
        {
          name: "Scoped policy one",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );
    const secondPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_runs_scope",
        comparisonSet.comparisonSetId,
        {
          name: "Scoped policy two",
          cadence: "daily",
          nextRunAt: "2026-04-18T13:00:00.000Z",
          enabled: true,
        },
      );

    const firstRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${firstPolicy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_runs_scope",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(firstRunResponse.status, HttpStatus.CREATED);

    const secondRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${secondPolicy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_runs_scope",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(secondRunResponse.status, HttpStatus.CREATED);

    const ownerRunsResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${firstPolicy.policyId}/runs`,
      {
        user: {
          userId: "creator_delivery_runs_scope",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(ownerRunsResponse.status, HttpStatus.OK);
    assert.equal(ownerRunsResponse.body.totalCount, 1);
    assert.equal(ownerRunsResponse.body.items.length, 1);
    assert.equal(ownerRunsResponse.body.items[0].policyId, firstPolicy.policyId);
    assert.equal(
      ownerRunsResponse.body.items[0].exportId,
      firstRunResponse.body.export.exportId,
    );

    const strangerRunsResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${firstPolicy.policyId}/runs`,
      {
        user: {
          userId: "creator_delivery_runs_scope_other",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(strangerRunsResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(strangerRunsResponse.body.success, false);
    assert.equal(
      strangerRunsResponse.body.error.code,
      "requester_comparison_set.not_found",
    );
  });
});

test("manual requester comparison set delivery run failures persist failed run history", async () => {
  await withHttpArenaApp(async ({ app, baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Failed manual run settled AI proposition",
      createdByUserId: "creator_delivery_runs_failed_manual",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_runs_failed_manual_participant_a"],
        assignedAt: arenaTime(520),
        expiresAt: arenaTime(530),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_runs_failed_manual_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(520, 10),
      clientSubmittedAt: arenaTime(520, 20),
      understandingAck: true,
      submittedAt: arenaTime(520, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(520, 30),
      reviewedByUserId: "reviewer_delivery_runs_failed_manual",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_runs_failed_manual_trader_a",
      selectedOption: 0,
      stakeAmount: "31",
      placedAt: arenaTime(521),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(522),
      updatedByUserId: "operator_delivery_runs_failed_manual",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(523),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_runs_failed_manual",
      {
        name: "Failed manual run preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_runs_failed_manual",
        {
          name: "Failed manual run comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
      "creator_delivery_runs_failed_manual",
      comparisonSet.comparisonSetId,
      {
        name: "Failed manual run policy",
        cadence: "daily",
        nextRunAt: "2026-04-18T12:00:00.000Z",
        enabled: true,
      },
    );

    app.get(RequesterPropositionViewService).createOwnedComparisonSetExport =
      async () => {
        throw new ArenaValidationError(
          "requester_comparison_set_delivery.run_failed",
          "Requester comparison set delivery manual run failed for test",
        );
      };

    const runResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_runs_failed_manual",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );

    assert.equal(runResponse.status, HttpStatus.CONFLICT);
    assert.equal(
      runResponse.body.error.code,
      "requester_comparison_set_delivery.run_failed",
    );

    const failedRunsResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
      {
        user: {
          userId: "creator_delivery_runs_failed_manual",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(failedRunsResponse.status, HttpStatus.OK);
    assert.equal(failedRunsResponse.body.totalCount, 1);
    assert.equal(failedRunsResponse.body.appliedFilters.status, "failed");
    assert.equal(failedRunsResponse.body.items[0].status, "failed");
    assert.equal(failedRunsResponse.body.items[0].triggerType, "manual");
    assert.equal(failedRunsResponse.body.items[0].exportId, null);
    assert.equal(
      failedRunsResponse.body.items[0].origin.type,
      "delivery_policy_manual",
    );
    assert.equal(
      failedRunsResponse.body.items[0].error.code,
      "requester_comparison_set_delivery.run_failed",
    );
    assert.equal(
      failedRunsResponse.body.items[0].error.message,
      "Requester comparison set delivery manual run failed for test",
    );

    const completedRunsResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=completed`,
      {
        user: {
          userId: "creator_delivery_runs_failed_manual",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(completedRunsResponse.status, HttpStatus.OK);
    assert.equal(completedRunsResponse.body.totalCount, 0);
    assert.equal(completedRunsResponse.body.appliedFilters.status, "completed");

    const storedPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
        "creator_delivery_runs_failed_manual",
        comparisonSet.comparisonSetId,
        policy.policyId,
      );
    assert.equal(storedPolicy.lastRunAt, null);
    assert.equal(storedPolicy.lastRunStatus, "failed");
    assert.equal(
      storedPolicy.lastRunError?.code,
      "requester_comparison_set_delivery.run_failed",
    );
  });
});

test("manual requester comparison set delivery marks run failed when webhook transport delivery fails but preserves the export artifact", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Failed transport settled AI proposition",
      createdByUserId: "creator_delivery_transport_failed_manual",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_transport_failed_manual_participant_a"],
        assignedAt: arenaTime(525),
        expiresAt: arenaTime(535),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_transport_failed_manual_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(525, 10),
      clientSubmittedAt: arenaTime(525, 20),
      understandingAck: true,
      submittedAt: arenaTime(525, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(525, 30),
      reviewedByUserId: "reviewer_delivery_transport_failed_manual",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_transport_failed_manual_trader_a",
      selectedOption: 0,
      stakeAmount: "31",
      placedAt: arenaTime(526),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(527),
      updatedByUserId: "operator_delivery_transport_failed_manual",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(528),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_transport_failed_manual",
      {
        name: "Failed transport preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_transport_failed_manual",
        {
          name: "Failed transport comparison set",
          presetIds: [preset.presetId],
        },
      );
    const failingServer = await createWebhookCaptureServer([], {
      statusCode: 500,
      responseBody: { ok: false },
    });

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_transport_failed_manual",
        comparisonSet.comparisonSetId,
        {
          name: "Failed transport policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${failingServer.baseUrl}/failed-delivery`,
          },
        },
      );

      const runResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_transport_failed_manual",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(runResponse.status, HttpStatus.CONFLICT);
      assert.equal(
        runResponse.body.error.code,
        "requester_comparison_set_delivery.transport_failed",
      );

      const exports =
        await harness.requesterPropositionViewService.listOwnedComparisonSetExports({
          userId: "creator_delivery_transport_failed_manual",
          comparisonSetId: comparisonSet.comparisonSetId,
        });
      assert.equal(exports.totalCount, 1);
      assert.equal(exports.items[0].origin.type, "delivery_policy_manual");

      const failedRuns =
        await harness.requesterPropositionViewService.listOwnedComparisonSetDeliveryPolicyRuns(
          {
            userId: "creator_delivery_transport_failed_manual",
            comparisonSetId: comparisonSet.comparisonSetId,
            policyId: policy.policyId,
          },
        );
      assert.equal(failedRuns.totalCount, 1);
      assert.equal(failedRuns.items[0].status, "failed");
      assert.equal(failedRuns.items[0].exportId, exports.items[0].exportId);
      assert.equal(
        failedRuns.items[0].error.code,
        "requester_comparison_set_delivery.transport_failed",
      );

      const policyState =
        await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
          "creator_delivery_transport_failed_manual",
          comparisonSet.comparisonSetId,
          policy.policyId,
        );
      assert.equal(policyState.lastRunStatus, "failed");
      assert.equal(
        policyState.lastRunError?.code,
        "requester_comparison_set_delivery.transport_failed",
      );
      assert.equal(policyState.lastRunAt, null);
    } finally {
      await failingServer.close();
    }
  });
});

test("retrying a failed requester comparison set delivery run reuses the preserved export artifact and recovers policy state", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Retry failed transport settled AI proposition",
      createdByUserId: "creator_delivery_transport_retry",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_transport_retry_participant_a"],
        assignedAt: arenaTime(526),
        expiresAt: arenaTime(536),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_transport_retry_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(526, 10),
      clientSubmittedAt: arenaTime(526, 20),
      understandingAck: true,
      submittedAt: arenaTime(526, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(526, 30),
      reviewedByUserId: "reviewer_delivery_transport_retry",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_transport_retry_trader_a",
      selectedOption: 0,
      stakeAmount: "29",
      placedAt: arenaTime(527),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(528),
      updatedByUserId: "operator_delivery_transport_retry",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(529),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_transport_retry",
      {
        name: "Retry transport preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_transport_retry",
        {
          name: "Retry transport comparison set",
          presetIds: [preset.presetId],
        },
      );
    const transportBehavior = {
      statusCode: 500,
      responseBody: { ok: false },
    };
    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(
      deliveries,
      transportBehavior,
    );

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_transport_retry",
        comparisonSet.comparisonSetId,
        {
          name: "Retry transport policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/retry-delivery`,
          },
        },
      );

      const failedRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_transport_retry",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);
      assert.equal(
        failedRunResponse.body.error.code,
        "requester_comparison_set_delivery.transport_failed",
      );

      const failedRunsBeforeRetry = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
        {
          user: {
            userId: "creator_delivery_transport_retry",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(failedRunsBeforeRetry.status, HttpStatus.OK);
      assert.equal(failedRunsBeforeRetry.body.totalCount, 1);
      assert.equal(
        failedRunsBeforeRetry.body.items[0].error.code,
        "requester_comparison_set_delivery.transport_failed",
      );
      const failedRunId = failedRunsBeforeRetry.body.items[0].runId;
      const preservedExportId = failedRunsBeforeRetry.body.items[0].exportId;
      assert.equal(typeof preservedExportId, "string");
      assert.equal(deliveries.length, 1);

      transportBehavior.statusCode = 200;
      transportBehavior.responseBody = { ok: true };

      const retryResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs/${failedRunId}/retry`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_transport_retry",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(retryResponse.status, HttpStatus.CREATED);
      assert.equal(retryResponse.body.retriedRunId, failedRunId);
      assert.equal(typeof retryResponse.body.retryRunId, "string");
      assert.equal(retryResponse.body.run.runId, retryResponse.body.retryRunId);
      assert.equal(retryResponse.body.run.retriedRunId, failedRunId);
      assert.equal(retryResponse.body.run.triggerType, "manual");
      assert.equal(retryResponse.body.export.exportId, preservedExportId);
      assert.equal(retryResponse.body.delivery.statusCode, 200);
      assert.equal(retryResponse.body.policy.lastRunStatus, "completed");
      assert.equal(retryResponse.body.policy.lastRunError, null);
      assert.equal(
        retryResponse.body.policy.nextRunAt,
        "2026-04-19T12:00:00.000Z",
      );
      assert.equal(deliveries.length, 2);
      assert.equal(deliveries[1].path, "/retry-delivery");
      assert.equal(deliveries[1].body.export.exportId, preservedExportId);

      const runsAfterRetry = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_transport_retry",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(runsAfterRetry.status, HttpStatus.OK);
      assert.equal(runsAfterRetry.body.totalCount, 2);
      assert.equal(runsAfterRetry.body.items[0].runId, retryResponse.body.retryRunId);
      assert.equal(runsAfterRetry.body.items[0].retriedRunId, failedRunId);
      assert.equal(runsAfterRetry.body.items[1].retriedRunId, null);
      assert.equal(
        runsAfterRetry.body.items.filter(
          (item: { exportId: string | null }) => item.exportId === preservedExportId,
        ).length,
        2,
      );

      const healthResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:15:00.000Z`,
        {
          user: {
            userId: "creator_delivery_transport_retry",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(healthResponse.status, HttpStatus.OK);
      assert.equal(healthResponse.body.health.status, "scheduled");
      assert.equal(healthResponse.body.health.consecutiveFailureCount, 0);
      assert.equal(
        healthResponse.body.health.latestRun.exportId,
        preservedExportId,
      );
    } finally {
      await webhookServer.close();
    }
  });
});

test("retrying a failed requester comparison set delivery run persists retry provenance when replay fails again", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Retry failed transport remains attributable proposition",
      createdByUserId: "creator_delivery_transport_retry_failed_again",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_transport_retry_failed_again_participant_a"],
        assignedAt: arenaTime(530),
        expiresAt: arenaTime(540),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_transport_retry_failed_again_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(530, 10),
      clientSubmittedAt: arenaTime(530, 20),
      understandingAck: true,
      submittedAt: arenaTime(530, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(530, 30),
      reviewedByUserId: "reviewer_delivery_transport_retry_failed_again",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_transport_retry_failed_again_trader_a",
      selectedOption: 0,
      stakeAmount: "31",
      placedAt: arenaTime(531),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(532),
      updatedByUserId: "operator_delivery_transport_retry_failed_again",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(533),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_transport_retry_failed_again",
      {
        name: "Retry failed again preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_transport_retry_failed_again",
        {
          name: "Retry failed again comparison set",
          presetIds: [preset.presetId],
        },
      );

    const transportBehavior = {
      statusCode: 503,
      responseBody: { ok: false },
    };
    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(
      deliveries,
      transportBehavior,
    );

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_transport_retry_failed_again",
        comparisonSet.comparisonSetId,
        {
          name: "Retry failed again policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/retry-failed-again`,
          },
        },
      );

      const failedRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_transport_retry_failed_again",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);

      const failedRunsBeforeRetry = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
        {
          user: {
            userId: "creator_delivery_transport_retry_failed_again",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(failedRunsBeforeRetry.status, HttpStatus.OK);
      assert.equal(failedRunsBeforeRetry.body.totalCount, 1);
      const failedRunId = failedRunsBeforeRetry.body.items[0].runId;

      const retryResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs/${failedRunId}/retry`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_transport_retry_failed_again",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(retryResponse.status, HttpStatus.CONFLICT);

      const runsAfterRetryFailure = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_transport_retry_failed_again",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(runsAfterRetryFailure.status, HttpStatus.OK);
      assert.equal(runsAfterRetryFailure.body.totalCount, 2);
      assert.equal(runsAfterRetryFailure.body.items[0].status, "failed");
      assert.equal(runsAfterRetryFailure.body.items[0].retriedRunId, failedRunId);
      assert.equal(runsAfterRetryFailure.body.items[0].exportId, failedRunsBeforeRetry.body.items[0].exportId);
      assert.equal(runsAfterRetryFailure.body.items[1].retriedRunId, null);

      const replayedOnlyRuns = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?replay=replayed_only`,
        {
          user: {
            userId: "creator_delivery_transport_retry_failed_again",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(replayedOnlyRuns.status, HttpStatus.OK);
      assert.equal(replayedOnlyRuns.body.totalCount, 1);
      assert.equal(replayedOnlyRuns.body.storedCount, 2);
      assert.equal(replayedOnlyRuns.body.appliedFilters.replay, "replayed_only");
      assert.equal(replayedOnlyRuns.body.items[0].retriedRunId, failedRunId);
    } finally {
      await webhookServer.close();
    }
  });
});

test("requester comparison set delivery automation records failed runs and continues other due policies", async () => {
  await withHttpArenaApp(async ({ app, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Failed automation run settled AI proposition",
      createdByUserId: "creator_delivery_runs_failed_automation",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_runs_failed_automation_participant_a"],
        assignedAt: arenaTime(530),
        expiresAt: arenaTime(540),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_runs_failed_automation_participant_a",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(530, 10),
      clientSubmittedAt: arenaTime(530, 20),
      understandingAck: true,
      submittedAt: arenaTime(530, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(530, 30),
      reviewedByUserId: "reviewer_delivery_runs_failed_automation",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_runs_failed_automation_trader_a",
      selectedOption: 1,
      stakeAmount: "33",
      placedAt: arenaTime(531),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(532),
      updatedByUserId: "operator_delivery_runs_failed_automation",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(533),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_runs_failed_automation",
      {
        name: "Failed automation run preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_runs_failed_automation",
        {
          name: "Failed automation run comparison set",
          presetIds: [preset.presetId],
        },
      );
    const failingPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_runs_failed_automation",
        comparisonSet.comparisonSetId,
        {
          name: "Failing automation policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );
    const successfulPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_runs_failed_automation",
        comparisonSet.comparisonSetId,
        {
          name: "Successful automation policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );

    const requesterViews = app.get(RequesterPropositionViewService);
    const originalCreateOwnedComparisonSetExport =
      requesterViews.createOwnedComparisonSetExport.bind(requesterViews);
    requesterViews.createOwnedComparisonSetExport = async (input, db) => {
      if (input.origin?.policyId === failingPolicy.policyId) {
        throw new ArenaValidationError(
          "requester_comparison_set_delivery.automation_failed",
          "Requester comparison set delivery automation failed for test",
        );
      }

      return originalCreateOwnedComparisonSetExport(input, db);
    };

    const result =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-18T12:05:00.000Z",
      });

    assert.equal(result.processedCount, 2);
    assert.equal(result.completedCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.items.length, 2);

    const failedItem = result.items.find(
      (item: { status: string; policyId: string }) =>
        item.status === "failed" && item.policyId === failingPolicy.policyId,
    );
    const completedItem = result.items.find(
      (item: { status: string; policyId: string }) =>
        item.status === "completed" &&
        item.policyId === successfulPolicy.policyId,
    );

    assert.ok(failedItem);
    assert.ok(completedItem);
    assert.equal(failedItem.export, null);
    assert.equal(
      failedItem.error.code,
      "requester_comparison_set_delivery.automation_failed",
    );
    assert.equal(completedItem.export?.status, "completed");

    const failedRuns =
      await harness.requesterPropositionViewService.listOwnedComparisonSetDeliveryPolicyRuns(
        {
          userId: "creator_delivery_runs_failed_automation",
          comparisonSetId: comparisonSet.comparisonSetId,
          policyId: failingPolicy.policyId,
        },
      );
    assert.equal(failedRuns.totalCount, 1);
    assert.equal(failedRuns.items[0].status, "failed");
    assert.equal(failedRuns.items[0].triggerType, "automation");
    assert.equal(failedRuns.items[0].exportId, null);
    assert.equal(
      failedRuns.items[0].error.code,
      "requester_comparison_set_delivery.automation_failed",
    );

    const completedRuns =
      await harness.requesterPropositionViewService.listOwnedComparisonSetDeliveryPolicyRuns(
        {
          userId: "creator_delivery_runs_failed_automation",
          comparisonSetId: comparisonSet.comparisonSetId,
          policyId: successfulPolicy.policyId,
        },
      );
    assert.equal(completedRuns.totalCount, 1);
    assert.equal(completedRuns.items[0].status, "completed");
    assert.equal(completedRuns.items[0].triggerType, "automation");
    assert.equal(completedRuns.items[0].exportId !== null, true);

    const failedPolicyState =
      await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
        "creator_delivery_runs_failed_automation",
        comparisonSet.comparisonSetId,
        failingPolicy.policyId,
      );
    assert.equal(failedPolicyState.lastRunAt, null);
    assert.equal(failedPolicyState.lastRunStatus, "failed");
    assert.equal(
      failedPolicyState.lastRunError?.code,
      "requester_comparison_set_delivery.automation_failed",
    );

    const completedPolicyState =
      await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
        "creator_delivery_runs_failed_automation",
        comparisonSet.comparisonSetId,
        successfulPolicy.policyId,
      );
    assert.equal(completedPolicyState.lastRunStatus, "completed");
    assert.equal(completedPolicyState.lastRunError, null);
    assert.equal(completedPolicyState.lastRunAt !== null, true);
  });
});

test("requester comparison set delivery policy state reflects failed then recovered manual runs", async () => {
  await withHttpArenaApp(async ({ app, baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Policy recovery settled AI proposition",
      createdByUserId: "creator_delivery_policy_recovery",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_policy_recovery_participant_a"],
        assignedAt: arenaTime(540),
        expiresAt: arenaTime(550),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_policy_recovery_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(540, 10),
      clientSubmittedAt: arenaTime(540, 20),
      understandingAck: true,
      submittedAt: arenaTime(540, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(540, 30),
      reviewedByUserId: "reviewer_delivery_policy_recovery",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_policy_recovery_trader_a",
      selectedOption: 0,
      stakeAmount: "35",
      placedAt: arenaTime(541),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(542),
      updatedByUserId: "operator_delivery_policy_recovery",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(543),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_policy_recovery",
      {
        name: "Policy recovery preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_policy_recovery",
        {
          name: "Policy recovery comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
      "creator_delivery_policy_recovery",
      comparisonSet.comparisonSetId,
      {
        name: "Policy recovery run",
        cadence: "daily",
        nextRunAt: "2026-04-18T12:00:00.000Z",
        enabled: true,
      },
    );

    const requesterViews = app.get(RequesterPropositionViewService);
    const originalCreateOwnedComparisonSetExport =
      requesterViews.createOwnedComparisonSetExport.bind(requesterViews);
    let shouldFail = true;
    requesterViews.createOwnedComparisonSetExport = async (input, db) => {
      if (shouldFail) {
        throw new ArenaValidationError(
          "requester_comparison_set_delivery.policy_recovery_failed",
          "Requester comparison set delivery recovery failure for test",
        );
      }

      return originalCreateOwnedComparisonSetExport(input, db);
    };

    const failedRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy_recovery",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);

    const failedPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
        "creator_delivery_policy_recovery",
        comparisonSet.comparisonSetId,
        policy.policyId,
      );
    assert.equal(failedPolicy.lastRunStatus, "failed");
    assert.equal(
      failedPolicy.lastRunError?.code,
      "requester_comparison_set_delivery.policy_recovery_failed",
    );

    shouldFail = false;

    const successfulRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy_recovery",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(successfulRunResponse.status, HttpStatus.CREATED);

    const recoveredPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.getPolicyForUser(
        "creator_delivery_policy_recovery",
        comparisonSet.comparisonSetId,
        policy.policyId,
      );
    assert.equal(recoveredPolicy.lastRunStatus, "completed");
    assert.equal(recoveredPolicy.lastRunError, null);
    assert.equal(recoveredPolicy.lastRunAt !== null, true);
  });
});

test("requester comparison set delivery policy health reflects due, failing, and recovered scheduler state", async () => {
  await withHttpArenaApp(async ({ app, baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Policy health settled AI proposition",
      createdByUserId: "creator_delivery_policy_health",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_policy_health_participant_a"],
        assignedAt: arenaTime(545),
        expiresAt: arenaTime(555),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_policy_health_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(545, 10),
      clientSubmittedAt: arenaTime(545, 20),
      understandingAck: true,
      submittedAt: arenaTime(545, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(545, 30),
      reviewedByUserId: "reviewer_delivery_policy_health",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_policy_health_trader_a",
      selectedOption: 0,
      stakeAmount: "41",
      placedAt: arenaTime(546),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(547),
      updatedByUserId: "operator_delivery_policy_health",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(548),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_policy_health",
      {
        name: "Policy health preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_policy_health",
        {
          name: "Policy health comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
      "creator_delivery_policy_health",
      comparisonSet.comparisonSetId,
      {
        name: "Policy health run",
        cadence: "daily",
        nextRunAt: "2026-04-18T12:00:00.000Z",
        enabled: true,
      },
    );

    const initialHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:05:00.000Z`,
      {
        user: {
          userId: "creator_delivery_policy_health",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(initialHealthResponse.status, HttpStatus.OK);
    assert.equal(initialHealthResponse.body.policy.policyId, policy.policyId);
    assert.equal(initialHealthResponse.body.health.status, "due");
    assert.equal(initialHealthResponse.body.health.isDue, true);
    assert.equal(initialHealthResponse.body.health.lagSeconds, 300);
    assert.equal(initialHealthResponse.body.health.consecutiveFailureCount, 0);
    assert.equal(initialHealthResponse.body.health.latestRun, null);
    assert.equal(initialHealthResponse.body.health.lastCompletedRunAt, null);
    assert.equal(initialHealthResponse.body.health.lastFailedRunAt, null);
    assert.equal(initialHealthResponse.body.health.runCounts.totalCount, 0);
    assert.equal(initialHealthResponse.body.health.runCounts.completedCount, 0);
    assert.equal(initialHealthResponse.body.health.runCounts.failedCount, 0);

    const requesterViews = app.get(RequesterPropositionViewService);
    const originalCreateOwnedComparisonSetExport =
      requesterViews.createOwnedComparisonSetExport.bind(requesterViews);
    let shouldFail = true;
    requesterViews.createOwnedComparisonSetExport = async (input, db) => {
      if (shouldFail) {
        throw new ArenaValidationError(
          "requester_comparison_set_delivery.policy_health_failed",
          "Requester comparison set delivery health failure for test",
        );
      }

      return originalCreateOwnedComparisonSetExport(input, db);
    };

    const failedRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy_health",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);

    const failedHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:10:00.000Z`,
      {
        user: {
          userId: "creator_delivery_policy_health",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(failedHealthResponse.status, HttpStatus.OK);
    assert.equal(failedHealthResponse.body.policy.lastRunStatus, "failed");
    assert.equal(
      failedHealthResponse.body.policy.lastRunError.code,
      "requester_comparison_set_delivery.policy_health_failed",
    );
    assert.equal(failedHealthResponse.body.health.status, "failing");
    assert.equal(failedHealthResponse.body.health.isDue, true);
    assert.equal(failedHealthResponse.body.health.lagSeconds, 600);
    assert.equal(failedHealthResponse.body.health.consecutiveFailureCount, 1);
    assert.equal(failedHealthResponse.body.health.latestRun.status, "failed");
    assert.equal(failedHealthResponse.body.health.latestRun.triggerType, "manual");
    assert.equal(
      failedHealthResponse.body.health.latestRun.error.code,
      "requester_comparison_set_delivery.policy_health_failed",
    );
    assert.equal(failedHealthResponse.body.health.lastCompletedRunAt, null);
    assert.equal(failedHealthResponse.body.health.lastFailedRunAt !== null, true);
    assert.equal(failedHealthResponse.body.health.runCounts.totalCount, 1);
    assert.equal(failedHealthResponse.body.health.runCounts.completedCount, 0);
    assert.equal(failedHealthResponse.body.health.runCounts.failedCount, 1);

    shouldFail = false;

    const successfulRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy_health",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(successfulRunResponse.status, HttpStatus.CREATED);

    const recoveredHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:15:00.000Z`,
      {
        user: {
          userId: "creator_delivery_policy_health",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(recoveredHealthResponse.status, HttpStatus.OK);
    assert.equal(recoveredHealthResponse.body.policy.lastRunStatus, "completed");
    assert.equal(recoveredHealthResponse.body.policy.lastRunError, null);
    assert.equal(
      recoveredHealthResponse.body.policy.nextRunAt,
      "2026-04-19T12:00:00.000Z",
    );
    assert.equal(recoveredHealthResponse.body.health.status, "scheduled");
    assert.equal(recoveredHealthResponse.body.health.isDue, false);
    assert.equal(recoveredHealthResponse.body.health.lagSeconds, 0);
    assert.equal(recoveredHealthResponse.body.health.consecutiveFailureCount, 0);
    assert.equal(
      recoveredHealthResponse.body.health.latestRun.status,
      "completed",
    );
    assert.equal(
      recoveredHealthResponse.body.health.lastCompletedRunAt !== null,
      true,
    );
    assert.equal(
      recoveredHealthResponse.body.health.lastFailedRunAt !== null,
      true,
    );
    assert.equal(recoveredHealthResponse.body.health.runCounts.totalCount, 2);
    assert.equal(recoveredHealthResponse.body.health.runCounts.completedCount, 1);
    assert.equal(recoveredHealthResponse.body.health.runCounts.failedCount, 1);

    const otherUserHealthResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:15:00.000Z`,
      {
        user: {
          userId: "creator_delivery_policy_health_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherUserHealthResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserHealthResponse.body.error.code,
      "requester_comparison_set.not_found",
    );
  });
});

test("deleting a requester comparison set delivery policy preserves historical exports but removes scheduler state", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Policy delete settled AI proposition",
      createdByUserId: "creator_delivery_policy_delete",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_policy_delete_participant_a"],
        assignedAt: arenaTime(544),
        expiresAt: arenaTime(554),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_policy_delete_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(544, 10),
      clientSubmittedAt: arenaTime(544, 20),
      understandingAck: true,
      submittedAt: arenaTime(544, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(544, 30),
      reviewedByUserId: "reviewer_delivery_policy_delete",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_policy_delete_trader_a",
      selectedOption: 0,
      stakeAmount: "37",
      placedAt: arenaTime(545),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(546),
      updatedByUserId: "operator_delivery_policy_delete",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(547),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_policy_delete",
      {
        name: "Delete policy preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_policy_delete",
        {
          name: "Delete policy comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
      "creator_delivery_policy_delete",
      comparisonSet.comparisonSetId,
      {
        name: "Delete policy run",
        cadence: "daily",
        nextRunAt: "2026-04-18T12:00:00.000Z",
        enabled: true,
      },
    );

    const manualRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_policy_delete",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(manualRunResponse.status, HttpStatus.CREATED);

    await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
      "creator_delivery_policy_delete",
      comparisonSet.comparisonSetId,
      policy.policyId,
      {
        nextRunAt: "2026-04-18T12:00:00.000Z",
      },
    );

    const otherUserDeleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_delivery_policy_delete_other",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(otherUserDeleteResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      otherUserDeleteResponse.body.error.code,
      "requester_comparison_set_delivery_policy.not_found",
    );

    const deleteResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}`,
      {
        method: "DELETE",
        user: {
          userId: "creator_delivery_policy_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(deleteResponse.status, HttpStatus.OK);
    assert.equal(deleteResponse.body.deleted, true);
    assertInternalIdentityAbsentRecursively(deleteResponse.body);
    assert.equal(deleteResponse.body.comparisonSetId, comparisonSet.comparisonSetId);
    assert.equal(deleteResponse.body.policyId, policy.policyId);

    const listResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies`,
      {
        user: {
          userId: "creator_delivery_policy_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(listResponse.status, HttpStatus.OK);
    assert.equal(listResponse.body.totalCount, 0);
    assert.deepEqual(listResponse.body.items, []);

    const runHistoryResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
      {
        user: {
          userId: "creator_delivery_policy_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(runHistoryResponse.status, HttpStatus.NOT_FOUND);
    assert.equal(
      runHistoryResponse.body.error.code,
      "requester_comparison_set_delivery_policy.not_found",
    );

    const duePoliciesAfterDelete =
      await harness.requesterComparisonSetDeliveryPolicyService.listDuePolicies(
        "2026-04-18T12:05:00.000Z",
      );
    assert.equal(
      duePoliciesAfterDelete.some((item) => item.policyId === policy.policyId),
      false,
    );

    const automationAfterDelete =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-18T12:05:00.000Z",
      });
    assert.equal(automationAfterDelete.processedCount, 0);
    assert.equal(automationAfterDelete.failedCount, 0);

    const exportListResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_delivery_policy_delete",
          roles: [SystemRole.User],
        },
      },
    );
    assert.equal(exportListResponse.status, HttpStatus.OK);
    assert.equal(exportListResponse.body.totalCount, 1);
    assert.equal(
      exportListResponse.body.items[0].exportId,
      manualRunResponse.body.export.exportId,
    );
    assert.equal(
      exportListResponse.body.items[0].origin.policyId,
      policy.policyId,
    );

    const activePolicyKeys = harness.store.systemKeyValues
      .filter((item) => item.deletedAt === null)
      .map((item) => item.key)
      .filter(
        (key) =>
          key.includes("creator_delivery_policy_delete") &&
          key.includes(comparisonSet.comparisonSetId) &&
          key.includes("delivery_policies"),
      );
    assert.equal(activePolicyKeys.length, 1);

    const deletedRunKeys = harness.store.systemKeyValues
      .filter((item) => item.deletedAt !== null)
      .map((item) => item.key)
      .filter(
        (key) =>
          key.includes("creator_delivery_policy_delete") &&
          key.includes(comparisonSet.comparisonSetId) &&
          key.includes(policy.policyId) &&
          key.includes("delivery_runs"),
      );
    assert.equal(deletedRunKeys.length, 1);
  });
});

test("creator requester comparison set export history supports origin and policy filters", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Export history settled AI proposition",
      createdByUserId: "creator_export_history",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_export_history_participant_a"],
        assignedAt: arenaTime(480),
        expiresAt: arenaTime(490),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_export_history_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(480, 10),
      clientSubmittedAt: arenaTime(480, 20),
      understandingAck: true,
      submittedAt: arenaTime(480, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(480, 30),
      reviewedByUserId: "reviewer_export_history",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_export_history_trader_a",
      selectedOption: 0,
      stakeAmount: "21",
      placedAt: arenaTime(481),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(482),
      updatedByUserId: "operator_export_history",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(483),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_export_history",
      {
        name: "History preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_export_history",
        {
          name: "History comparison set",
          presetIds: [preset.presetId],
        },
      );

    const manualCreateResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(manualCreateResponse.status, HttpStatus.CREATED);
    assert.equal(manualCreateResponse.body.origin.type, "manual");

    const manualPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_export_history",
        comparisonSet.comparisonSetId,
        {
          name: "History manual policy",
          cadence: "daily",
          nextRunAt: "2026-04-20T12:00:00.000Z",
          enabled: true,
        },
      );

    const manualPolicyRunResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${manualPolicy.policyId}/run`,
      {
        method: "POST",
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(manualPolicyRunResponse.status, HttpStatus.CREATED);
    assert.equal(
      manualPolicyRunResponse.body.export.origin.type,
      "delivery_policy_manual",
    );

    const automationPolicy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_export_history",
        comparisonSet.comparisonSetId,
        {
          name: "History automation policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
        },
      );

    const automationResult =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-18T12:05:00.000Z",
      });
    assert.equal(automationResult.processedCount, 1);
    assert.equal(
      automationResult.items[0].export.origin.type,
      "delivery_policy_automation",
    );

    const fullHistoryResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(fullHistoryResponse.status, HttpStatus.OK);
    assert.equal(fullHistoryResponse.body.totalCount, 3);
    assert.equal(fullHistoryResponse.body.storedCount, 3);
    assert.equal(fullHistoryResponse.body.appliedFilters.origin, null);
    assert.equal(fullHistoryResponse.body.appliedFilters.policyId, null);
    assert.equal(fullHistoryResponse.body.appliedFilters.limit, null);
    assert.deepEqual(
      [...fullHistoryResponse.body.items]
        .map((item: { origin: { type: string } }) => item.origin.type)
        .sort(),
      ["delivery_policy_automation", "delivery_policy_manual", "manual"],
    );

    const manualOnlyResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?origin=manual`,
      {
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(manualOnlyResponse.status, HttpStatus.OK);
    assert.equal(manualOnlyResponse.body.totalCount, 1);
    assert.equal(manualOnlyResponse.body.storedCount, 3);
    assert.equal(manualOnlyResponse.body.appliedFilters.origin, "manual");
    assert.equal(manualOnlyResponse.body.items[0].origin.type, "manual");

    const automationOnlyResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?origin=delivery_policy_automation`,
      {
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(automationOnlyResponse.status, HttpStatus.OK);
    assert.equal(automationOnlyResponse.body.totalCount, 1);
    assert.equal(
      automationOnlyResponse.body.items[0].origin.type,
      "delivery_policy_automation",
    );
    assert.equal(
      automationOnlyResponse.body.items[0].origin.policyId,
      automationPolicy.policyId,
    );

    const policyFilteredResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?policyId=${automationPolicy.policyId}`,
      {
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(policyFilteredResponse.status, HttpStatus.OK);
    assert.equal(policyFilteredResponse.body.totalCount, 1);
    assert.equal(policyFilteredResponse.body.appliedFilters.policyId, automationPolicy.policyId);
    assert.equal(
      policyFilteredResponse.body.items[0].origin.policyId,
      automationPolicy.policyId,
    );

    const limitedResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?limit=2`,
      {
        user: {
          userId: "creator_export_history",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(limitedResponse.status, HttpStatus.OK);
    assert.equal(limitedResponse.body.totalCount, 2);
    assert.equal(limitedResponse.body.storedCount, 3);
    assert.equal(limitedResponse.body.appliedFilters.limit, 2);
    assert.equal(limitedResponse.body.items.length, 2);
  });
});

test("requester comparison set delivery policy retention prunes older policy-origin exports without removing manual artifacts", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Retention settled AI proposition",
      createdByUserId: "creator_delivery_retention",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_retention_participant_a"],
        assignedAt: arenaTime(490),
        expiresAt: arenaTime(500),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_retention_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(490, 10),
      clientSubmittedAt: arenaTime(490, 20),
      understandingAck: true,
      submittedAt: arenaTime(490, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(490, 30),
      reviewedByUserId: "reviewer_delivery_retention",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_retention_trader_a",
      selectedOption: 0,
      stakeAmount: "23",
      placedAt: arenaTime(491),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(492),
      updatedByUserId: "operator_delivery_retention",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(493),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_retention",
      {
        name: "Retention preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_retention",
        {
          name: "Retention comparison set",
          presetIds: [preset.presetId],
        },
      );

    const manualExportResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_retention",
          roles: [SystemRole.User],
        },
        body: {},
      },
    );
    assert.equal(manualExportResponse.status, HttpStatus.CREATED);
    assert.equal(manualExportResponse.body.origin.type, "manual");

    const createPolicyResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies`,
      {
        method: "POST",
        user: {
          userId: "creator_delivery_retention",
          roles: [SystemRole.User],
        },
        body: {
          name: "Retention policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          retainedExportCount: 2,
        },
      },
    );
    assert.equal(createPolicyResponse.status, HttpStatus.CREATED);
    assert.equal(createPolicyResponse.body.retainedExportCount, 2);

    const policyId = createPolicyResponse.body.policyId;

    const firstAutomation =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-18T12:05:00.000Z",
      });
    assert.equal(firstAutomation.processedCount, 1);
    assert.equal(
      firstAutomation.items[0].export.origin.type,
      "delivery_policy_automation",
    );

    await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
      "creator_delivery_retention",
      comparisonSet.comparisonSetId,
      policyId,
      {
        nextRunAt: "2026-04-19T12:00:00.000Z",
      },
    );

    const secondAutomation =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-19T12:05:00.000Z",
      });
    assert.equal(secondAutomation.processedCount, 1);

    await harness.requesterComparisonSetDeliveryPolicyService.updatePolicyForUser(
      "creator_delivery_retention",
      comparisonSet.comparisonSetId,
      policyId,
      {
        nextRunAt: "2026-04-20T12:00:00.000Z",
      },
    );

    const thirdAutomation =
      await harness.requesterComparisonSetDeliveryAutomationService.runDuePolicies({
        now: "2026-04-20T12:05:00.000Z",
      });
    assert.equal(thirdAutomation.processedCount, 1);

    const allHistoryResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
      {
        user: {
          userId: "creator_delivery_retention",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(allHistoryResponse.status, HttpStatus.OK);
    assert.equal(allHistoryResponse.body.storedCount, 3);
    assert.equal(allHistoryResponse.body.totalCount, 3);
    assert.deepEqual(
      [...allHistoryResponse.body.items]
        .map((item: { origin: { type: string } }) => item.origin.type)
        .sort(),
      ["delivery_policy_automation", "delivery_policy_automation", "manual"],
    );

    const automationHistoryResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?origin=delivery_policy_automation`,
      {
        user: {
          userId: "creator_delivery_retention",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(automationHistoryResponse.status, HttpStatus.OK);
    assert.equal(automationHistoryResponse.body.storedCount, 3);
    assert.equal(automationHistoryResponse.body.totalCount, 2);
    assert.equal(
      automationHistoryResponse.body.items.every(
        (item: { origin: { policyId: string; type: string } }) =>
          item.origin.type === "delivery_policy_automation" &&
          item.origin.policyId === policyId,
      ),
      true,
    );
    assert.equal(
      automationHistoryResponse.body.items.some(
        (item: { requestedAt: string }) =>
          item.requestedAt === firstAutomation.items[0].export.requestedAt,
      ),
      false,
    );
    assert.equal(
      automationHistoryResponse.body.items.some(
        (item: { requestedAt: string }) =>
          item.requestedAt === secondAutomation.items[0].export.requestedAt,
      ),
      true,
    );
    assert.equal(
      automationHistoryResponse.body.items.some(
        (item: { requestedAt: string }) =>
          item.requestedAt === thirdAutomation.items[0].export.requestedAt,
      ),
      true,
    );

    const manualHistoryResponse = await requestJson(
      baseUrl,
      `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?origin=manual`,
      {
        user: {
          userId: "creator_delivery_retention",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(manualHistoryResponse.status, HttpStatus.OK);
    assert.equal(manualHistoryResponse.body.totalCount, 1);
    assert.equal(
      manualHistoryResponse.body.items[0].requestedAt,
      manualExportResponse.body.requestedAt,
    );
  });
});

test("requester comparison set delivery runs mark pruned preserved exports unavailable and reject retry after retention pruning", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settledAi = await createLiveProposition(harness, {
      title: "Pruned retry retention settled AI proposition",
      createdByUserId: "creator_delivery_retry_pruned",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    const [settledAiTask] =
      await harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: settledAi.id,
        userIds: ["creator_delivery_retry_pruned_participant_a"],
        assignedAt: arenaTime(494),
        expiresAt: arenaTime(504),
      });
    assert.ok(settledAiTask);
    const settledAiResponse = await harness.responseService.submitResponse({
      propositionId: settledAi.id,
      taskId: settledAiTask.id,
      userId: "creator_delivery_retry_pruned_participant_a",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(494, 10),
      clientSubmittedAt: arenaTime(494, 20),
      understandingAck: true,
      submittedAt: arenaTime(494, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: settledAiResponse.id,
      status: "valid",
      reviewedAt: arenaTime(494, 30),
      reviewedByUserId: "reviewer_delivery_retry_pruned",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settledAi.id);
    const settledAiMarket = await harness.marketRepository.findByPropositionId(
      settledAi.id,
    );
    assert.ok(settledAiMarket);
    await harness.betService.placeBet({
      propositionId: settledAi.id,
      marketId: settledAiMarket.id,
      userId: "creator_delivery_retry_pruned_trader_a",
      selectedOption: 0,
      stakeAmount: "25",
      placedAt: arenaTime(495),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settledAi.id,
      now: arenaTime(496),
      updatedByUserId: "operator_delivery_retry_pruned",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settledAi.id,
      settledAt: arenaTime(497),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_delivery_retry_pruned",
      {
        name: "Pruned retry preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_delivery_retry_pruned",
        {
          name: "Pruned retry comparison set",
          presetIds: [preset.presetId],
        },
      );

    const transportBehavior: {
      statusCode: number;
      responseBody: Record<string, unknown>;
    } = {
      statusCode: 500,
      responseBody: { ok: false },
    };
    const deliveries: Array<{
      path: string;
      body: any;
    }> = [];
    const webhookServer = await createWebhookCaptureServer(
      deliveries,
      transportBehavior,
    );

    try {
      const policy = await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_delivery_retry_pruned",
        comparisonSet.comparisonSetId,
        {
          name: "Pruned retry policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          retainedExportCount: 1,
          transport: {
            type: "webhook",
            targetUrl: `${webhookServer.baseUrl}/retry-pruned`,
          },
        },
      );

      const failedRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(failedRunResponse.status, HttpStatus.CONFLICT);
      assert.equal(
        failedRunResponse.body.error.code,
        "requester_comparison_set_delivery.transport_failed",
      );

      const failedRunsBeforePrune = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(failedRunsBeforePrune.status, HttpStatus.OK);
      assert.equal(failedRunsBeforePrune.body.totalCount, 1);
      assert.equal(failedRunsBeforePrune.body.items[0].retainedExportAvailable, true);
      const failedRunId = failedRunsBeforePrune.body.items[0].runId;
      const preservedExportId = failedRunsBeforePrune.body.items[0].exportId;
      assert.equal(typeof preservedExportId, "string");

      transportBehavior.statusCode = 202;
      transportBehavior.responseBody = { accepted: true };

      const successfulRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(successfulRunResponse.status, HttpStatus.CREATED);
      assert.notEqual(
        successfulRunResponse.body.export.exportId,
        preservedExportId,
      );

      const retainedExportsResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports?origin=delivery_policy_manual&policyId=${encodeURIComponent(policy.policyId)}`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(retainedExportsResponse.status, HttpStatus.OK);
      assert.equal(retainedExportsResponse.body.totalCount, 1);
      assert.equal(
        retainedExportsResponse.body.items[0].exportId,
        successfulRunResponse.body.export.exportId,
      );

      const runsAfterPrune = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(runsAfterPrune.status, HttpStatus.OK);
      assert.equal(runsAfterPrune.body.totalCount, 2);
      const prunedFailedRun =
        runsAfterPrune.body.items.find(
          (item: { runId: string }) => item.runId === failedRunId,
        ) ?? null;
      assert.ok(prunedFailedRun);
      assert.equal(prunedFailedRun.exportId, preservedExportId);
      assert.equal(prunedFailedRun.retainedExportAvailable, false);
      const latestSuccessfulRun =
        runsAfterPrune.body.items.find(
          (item: { runId: string }) =>
            item.runId === successfulRunResponse.body.run.runId,
        ) ?? null;
      assert.ok(latestSuccessfulRun);
      assert.equal(latestSuccessfulRun.retainedExportAvailable, true);

      const failedRunsAfterPrune = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs?status=failed`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(failedRunsAfterPrune.status, HttpStatus.OK);
      assert.equal(failedRunsAfterPrune.body.totalCount, 1);
      assert.equal(
        failedRunsAfterPrune.body.items[0].retainedExportAvailable,
        false,
      );

      const healthResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:20:00.000Z`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(healthResponse.status, HttpStatus.OK);
      assert.equal(
        healthResponse.body.health.latestRun.runId,
        successfulRunResponse.body.run.runId,
      );
      assert.equal(
        healthResponse.body.health.latestRun.retainedExportAvailable,
        true,
      );

      const retryResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs/${failedRunId}/retry`,
        {
          method: "POST",
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
          body: {},
        },
      );

      assert.equal(retryResponse.status, HttpStatus.CONFLICT);
      assert.equal(
        retryResponse.body.error.code,
        "requester_comparison_set_delivery_run.retry_export_unavailable",
      );

      const runsAfterRejectedRetry = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: {
            userId: "creator_delivery_retry_pruned",
            roles: [SystemRole.User],
          },
        },
      );

      assert.equal(runsAfterRejectedRetry.status, HttpStatus.OK);
      assert.equal(runsAfterRejectedRetry.body.totalCount, 2);
    } finally {
      await webhookServer.close();
    }
  });
});

test("creator proposition export detail backfills analytics for legacy stored requester exports", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const settled = await createLiveProposition(harness, {
      title: "Legacy requester export proposition",
      createdByUserId: "creator_export_legacy",
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "general",
    });
    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: settled.id,
      userIds: ["creator_export_legacy_participant"],
      assignedAt: arenaTime(400),
      expiresAt: arenaTime(410),
    });
    assert.ok(task);
    const response = await harness.responseService.submitResponse({
      propositionId: settled.id,
      taskId: task.id,
      userId: "creator_export_legacy_participant",
      selectedOption: 1,
      confirmationOption: 1,
      clientStartedAt: arenaTime(400, 10),
      clientSubmittedAt: arenaTime(400, 20),
      understandingAck: true,
      submittedAt: arenaTime(400, 20),
    });
    await harness.responseReviewService.finalizeReviewResult({
      responseId: response.id,
      status: "valid",
      reviewedAt: arenaTime(400, 30),
      reviewedByUserId: "reviewer_export_legacy",
      qualityScore: 100,
      flags: [],
      reasonCodes: [...defaultReasonCodesByStatus.valid],
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const market = await harness.marketRepository.findByPropositionId(settled.id);
    assert.ok(market);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: market.id,
      userId: "creator_export_legacy_trader",
      selectedOption: 1,
      stakeAmount: "19",
      placedAt: arenaTime(400, 40),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(401),
      updatedByUserId: "operator_export_legacy",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(402),
    });

    const freshExport = await harness.requesterPropositionViewService.createOwnedPropositionExport({
      userId: "creator_export_legacy",
    });

    const legacyStorageKey = "arena.requester.exports.creator_export_legacy";
    await harness.systemKeyValueRepository.upsertByKey(
      legacyStorageKey,
      {
        id: "system_key_value_legacy_export",
        key: legacyStorageKey,
        description: "Legacy requester export fixture",
        valueJson: [
          {
            exportId: "legacy_export_1",
            userId: "creator_export_legacy",
            status: "completed",
            format: "json",
            requestedAt: "2026-04-18T12:00:00.000Z",
            completedAt: "2026-04-18T12:00:00.000Z",
            fileName: "legacy-export.json",
            overview: freshExport.overview,
            reports: freshExport.reports,
          },
        ],
      },
      {
        valueJson: [
          {
            exportId: "legacy_export_1",
            userId: "creator_export_legacy",
            status: "completed",
            format: "json",
            requestedAt: "2026-04-18T12:00:00.000Z",
            completedAt: "2026-04-18T12:00:00.000Z",
            fileName: "legacy-export.json",
            overview: freshExport.overview,
            reports: freshExport.reports,
          },
        ],
      },
    );

    const legacyDetailResponse = await requestJson(
      baseUrl,
      "/arena/propositions/mine/exports/legacy_export_1",
      {
        user: {
          userId: "creator_export_legacy",
          roles: [SystemRole.User],
        },
      },
    );

    assert.equal(legacyDetailResponse.status, HttpStatus.OK);
    assert.equal(legacyDetailResponse.body.exportId, "legacy_export_1");
    assertInternalIdentityAbsentRecursively(legacyDetailResponse.body.analytics);
    assert.equal(legacyDetailResponse.body.analytics.windowDays, 30);
    assert.equal(legacyDetailResponse.body.analytics.totals.createdCount, 1);
    assert.equal(legacyDetailResponse.body.analytics.totals.settledCount, 1);
    assert.equal(legacyDetailResponse.body.analytics.totals.totalBetCount, 0);
    assert.equal(legacyDetailResponse.body.analytics.delivery.exportCount, 0);
  });
});

test("draft create validation failures still return 400 Bad Request", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/arena/propositions/drafts", {
      method: "POST",
      user: {
        userId: "creator_invalid_payload",
        roles: [SystemRole.User],
      },
      body: {
        title: "Invalid draft payload",
        summary:
          "This request intentionally omits a required option field so that DTO validation still maps to a structured 400 response.",
        optionA: "Yes",
      },
    });

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed");
  });
});

test("internal routes still enforce role-based 403 responses", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/arena/internal/propositions", {
      user: {
        userId: "plain_user",
        roles: [SystemRole.User],
      },
    });

    assert.equal(response.status, HttpStatus.FORBIDDEN);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "FORBIDDEN");
    assert.equal(response.body.error.message, "Insufficient role");
  });
});

test("validation chain command DTO validation failures still return 400 Bad Request", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/cancel-market",
      {
        method: "POST",
        user: {
          userId: "admin_validation_chain",
          roles: [SystemRole.Admin],
        },
        body: {
          reason: "manual_cancel",
        },
      },
    );

    assert.equal(response.status, HttpStatus.BAD_REQUEST);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed");
  });
});

test("validation chain internal routes enforce stronger role requirements for pause", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const operatorResponse = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/pause",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "operator_should_fail",
        },
      },
    );

    assert.equal(operatorResponse.status, HttpStatus.FORBIDDEN);
    assert.equal(operatorResponse.body.error.code, "FORBIDDEN");

    const adminResponse = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/pause",
      {
        method: "POST",
        user: {
          userId: "admin_validation_chain",
          roles: [SystemRole.Admin],
        },
        body: {
          reason: "admin_pause",
        },
      },
    );

    assert.equal(adminResponse.status, HttpStatus.CREATED);
    assert.equal(adminResponse.body.contractAddress, "0xvalidationcontract");
  });
});

test("validation chain high-risk proposition routes require admin or system roles", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const highRiskRoutes = [
      {
        path: "/arena/internal/validation-chain/propositions/prop_1/freeze-market",
        body: { reason: "operator_freeze_attempt" },
      },
      {
        path: "/arena/internal/validation-chain/propositions/prop_1/resolve-market",
        body: { reason: "operator_resolve_attempt" },
      },
      {
        path: "/arena/internal/validation-chain/propositions/prop_1/cancel-market",
        body: {
          reason: "operator_cancel_attempt",
          reasonCode: "ops_cancel",
        },
      },
    ] as const;

    for (const route of highRiskRoutes) {
      const operatorResponse = await requestJson(baseUrl, route.path, {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: route.body,
      });

      assert.equal(operatorResponse.status, HttpStatus.FORBIDDEN);
      assert.equal(operatorResponse.body.error.code, "FORBIDDEN");

      const adminResponse = await requestJson(baseUrl, route.path, {
        method: "POST",
        user: {
          userId: "admin_validation_chain",
          roles: [SystemRole.Admin],
        },
        body: route.body,
      });

      assert.notEqual(adminResponse.status, HttpStatus.FORBIDDEN);
    }
  });
});

test("internal proposition emergency-freeze route requires admin or system roles", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
    });

    const operatorResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/emergency-freeze`,
      {
        method: "POST",
        user: {
          userId: "operator_freeze_attempt",
          roles: [SystemRole.Operator],
        },
        body: {
          frozenAt: "2026-04-18T10:08:00.000Z",
          reason: "smoke_test_freeze",
        },
      },
    );

    assert.equal(operatorResponse.status, HttpStatus.FORBIDDEN);
    assert.equal(operatorResponse.body.error.code, "FORBIDDEN");

    const adminResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/emergency-freeze`,
      {
        method: "POST",
        user: {
          userId: "admin_freeze_attempt",
          roles: [SystemRole.Admin],
        },
        body: {
          frozenAt: "2026-04-18T10:08:00.000Z",
          reason: "smoke_test_freeze",
        },
      },
    );

    assert.notEqual(adminResponse.status, HttpStatus.FORBIDDEN);
  });
});

test("system queue failed-job requeue route requires admin or system roles", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app.get(AppQueueService).requeueFailedJobs = async (queueName: string) => ({
      queue: queueName,
      failedCount: 2,
      retriedCount: 2,
      skippedCount: 0,
    });

    const operatorResponse = await requestJson(
      baseUrl,
      "/system/queues/scheduler/requeue-failed",
      {
        method: "POST",
        user: {
          userId: "operator_queue_retry",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(operatorResponse.status, HttpStatus.FORBIDDEN);
    assert.equal(operatorResponse.body.error.code, "FORBIDDEN");

    const adminResponse = await requestJson(
      baseUrl,
      "/system/queues/scheduler/requeue-failed",
      {
        method: "POST",
        user: {
          userId: "admin_queue_retry",
          roles: [SystemRole.Admin],
        },
      },
    );

    assert.equal(adminResponse.status, HttpStatus.CREATED);
    assert.equal(adminResponse.body.queue, "scheduler");
    assert.equal(adminResponse.body.retriedCount, 2);
  });
});

test("internal discovery-config routes allow operator reads but reserve writes for admin or system roles", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const operatorReadResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/global",
      {
        user: {
          userId: "operator_discovery_reader",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(operatorReadResponse.status, HttpStatus.OK);
    assert.equal(Array.isArray(operatorReadResponse.body.categories), true);

    const operatorWriteResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/global",
      {
        method: "PUT",
        user: {
          userId: "operator_discovery_writer",
          roles: [SystemRole.Operator],
        },
        body: {
          categories: [
            {
              slug: "politics",
              label: "政策雷达",
              title: "政策",
              directoryLabel: "政策目录",
              description: "政策议题与公共治理追踪",
              displayOrder: 1,
            },
          ],
          rankingCategoryLabels: {
            all: "全部赛道",
            general: "综合",
            politics: "政策",
            sports: "竞技",
            tech: "科技",
            research: "研究",
            culture: "文化",
          },
        },
      },
    );

    assert.equal(operatorWriteResponse.status, HttpStatus.FORBIDDEN);
    assert.equal(operatorWriteResponse.body.error.code, "FORBIDDEN");

    const adminWriteResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/global",
      {
        method: "PUT",
        user: {
          userId: "admin_discovery_writer",
          roles: [SystemRole.Admin],
        },
        body: {
          categories: [
            {
              slug: "politics",
              label: "政策雷达",
              title: "政策",
              directoryLabel: "政策目录",
              description: "政策议题与公共治理追踪",
              displayOrder: 1,
            },
          ],
          rankingCategoryLabels: {
            all: "全部赛道",
            general: "综合",
            politics: "政策",
            sports: "竞技",
            tech: "科技",
            research: "研究",
            culture: "文化",
          },
        },
      },
    );

    assert.equal(adminWriteResponse.status, HttpStatus.OK);
    assert.equal(
      adminWriteResponse.body.categories.some(
        (item: { slug: string; label: string }) =>
          item.slug === "politics" && item.label === "政策雷达",
      ),
      true,
    );

    const operatorCategoryReadResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/categories/politics",
      {
        user: {
          userId: "operator_category_reader",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(operatorCategoryReadResponse.status, HttpStatus.OK);
    assert.equal(
      Array.isArray(operatorCategoryReadResponse.body.sidebarItems),
      true,
    );

    const operatorCategoryWriteResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/categories/politics",
      {
        method: "PUT",
        user: {
          userId: "operator_category_writer",
          roles: [SystemRole.Operator],
        },
        body: {
          sidebarItems: [
            {
              id: "policy-focus",
              label: "政策焦点",
              linkedMarketIds: ["missing_market"],
            },
          ],
        },
      },
    );

    assert.equal(operatorCategoryWriteResponse.status, HttpStatus.FORBIDDEN);
    assert.equal(
      operatorCategoryWriteResponse.body.error.code,
      "FORBIDDEN",
    );

    const adminCategoryWriteResponse = await requestJson(
      baseUrl,
      "/arena/internal/discovery/config/categories/politics",
      {
        method: "PUT",
        user: {
          userId: "admin_category_writer",
          roles: [SystemRole.Admin],
        },
        body: {
          sidebarItems: [
            {
              id: "policy-focus",
              label: "政策焦点",
              linkedMarketIds: ["missing_market"],
            },
          ],
        },
      },
    );

    assert.equal(adminCategoryWriteResponse.status, HttpStatus.OK);
    assert.equal(
      adminCategoryWriteResponse.body.sidebarItems[0]?.invalidLinkedMarketIds?.includes(
        "missing_market",
      ),
      true,
    );
  });
});

test("validation chain internal sync route allows operator recovery calls", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/sync",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_sync",
          note: "recover_cursor",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.streamKey, VALIDATION_CHAIN_STREAM_KEY);
    assert.equal(response.body.processedEvents, 4);
  });
});

test("validation chain internal bet reconciliation route allows operator inspection calls", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP reconciliation inspection proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    const bet = await harness.betService.placeBet({
      marketId: market.id,
      propositionId: live.id,
      userId: "0x00000000000000000000000000000000000000aa",
      selectedOption: 1,
      stakeAmount: "40",
      placedAt: "2026-04-18T10:06:00.000Z",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/validation-chain/markets/${market.id}/bets/${bet.userId}/reconcile`,
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_reconcile",
          note: "backlog_check",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.betId, bet.id);
    assert.equal(response.body.onChainPosition.exists, true);
    assert.equal(response.body.comparison.amountMatches, true);
  });
});

test("validation chain bet reconciliation route automatically persists blocked rehearsal evidence for mismatches", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP reconciliation rehearsal proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    const bet = await harness.betService.placeBet({
      marketId: market.id,
      propositionId: live.id,
      userId: "0x00000000000000000000000000000000000000aa",
      selectedOption: 0,
      stakeAmount: "25",
      placedAt: "2026-04-18T10:06:00.000Z",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/validation-chain/markets/${market.id}/bets/${bet.userId}/reconcile`,
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_reconcile",
          note: "backlog_check",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    const detailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.validationRehearsalCheckpoints.length, 1);
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStepId,
      "local_bet_and_sync",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStatus,
      "blocked",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "local_bet_and_sync",
      )?.manualCheckpoint?.reason,
      "validation_rehearsal.auto.bet_reconciliation_mismatched",
    );
  });
});

test("validation chain internal backlog reconciliation route allows operator batch inspection calls", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    await createLiveProposition(harness, {
      marketEnabled: true,
      title: "HTTP backlog reconciliation proposition",
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/backlog/reconcile",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_reconcile_backlog",
          note: "ops_triage",
          limit: 10,
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.processedCount, 2);
    assert.equal(response.body.matchedCount, 1);
    assert.equal(response.body.mismatchedCount, 1);
    assert.equal(response.body.failedCount, 0);
  });
});

test("validation chain internal projection replay route automatically persists proposition rehearsal evidence", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP projection replay rehearsal proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);

    const response = await requestJson(
      baseUrl,
      `/arena/internal/validation-chain/markets/${market.id}/replay-projection`,
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_projection_replay",
          note: "repair_projection",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.marketId, market.id);
    assert.equal(response.body.replayedEventCount, 3);
    assert.equal(response.body.finalMarketProjection.chainStatus, "resolved");
    assert.equal(response.body.finalBetProjections[0].settlementOutcome, "won");

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.validationRehearsalCheckpoints.length, 1);
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStepId,
      "projection_and_settlement",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStatus,
      "complete",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "projection_and_settlement",
      )?.manualCheckpoint?.reason,
      "validation_rehearsal.auto.projection_settlement_converged",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "projection_and_settlement",
      )?.manualCheckpoint?.txHash,
      "0x12",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "projection_and_settlement",
      )?.manualCheckpoint?.evidence.includes("propositionStatus=settled"),
      true,
    );
  });
});

test("validation chain rehearsal checkpoint route persists operator evidence for proposition detail", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP rehearsal checkpoint proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });

    const checkpointResponse = await requestJson(
      baseUrl,
      `/arena/internal/validation-chain/propositions/${live.id}/rehearsal-checkpoints`,
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_stage_checkpoint",
          stepId: "publish_and_open",
          status: "complete",
          note: "opened on staging",
          evidence: ["tx:0x9999", "manual verification"],
          txHash: `0x${"e".repeat(64)}`,
          blockNumber: 52,
        },
      },
    );

    assert.equal(checkpointResponse.status, HttpStatus.CREATED);
    assert.equal(checkpointResponse.body.stepId, "publish_and_open");
    assert.equal(checkpointResponse.body.status, "complete");

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "publish_and_open",
      )?.manualCheckpoint?.txHash,
      `0x${"e".repeat(64)}`,
    );
    assert.equal(
      typeof detailResponse.body.validationRehearsal.environmentReadiness.status,
      "string",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStepId,
      "publish_and_open",
    );
    assert.equal(detailResponse.body.validationRehearsalCheckpoints.length, 1);
  });
});

test("validation chain proposition command routes automatically persist rehearsal evidence", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP automatic rehearsal checkpoint proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const response = await requestJson(
      baseUrl,
      `/arena/internal/validation-chain/propositions/${live.id}/create-market`,
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_chain_create",
          note: "operator_backfill",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    const detailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(detailResponse.body.validationRehearsalCheckpoints.length, 1);
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStepId,
      "publish_and_open",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "publish_and_open",
      )?.manualCheckpoint?.reason,
      "validation_rehearsal.auto.create_market_submitted",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "publish_and_open",
      )?.manualCheckpoint?.txHash,
      response.body.txHash,
    );
  });
});

test("validation rehearsal checkpoint list route returns proposition-scoped execution ledger", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP rehearsal checkpoint list proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });

    await harness.validationRehearsalCheckpointService.recordCheckpoint({
      propositionId: live.id,
      stepId: "publish_and_open",
      status: "complete",
      reason: "manual_stage_open_complete",
      evidence: ["tx:0x1111"],
      actorUserId: "operator_validation_chain",
      recordedAt: "2026-04-18T10:06:00.000Z",
    });
    await harness.validationRehearsalCheckpointService.recordCheckpoint({
      propositionId: live.id,
      stepId: "local_bet_and_sync",
      status: "blocked",
      reason: "awaiting_sync_projection",
      note: "BetPlaced not projected locally yet",
      evidence: ["chain event observed"],
      actorUserId: "operator_validation_chain",
      recordedAt: "2026-04-18T10:08:00.000Z",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}/rehearsal-checkpoints`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.length, 2);
    assert.equal(response.body[0].stepId, "local_bet_and_sync");
    assert.equal(response.body[0].status, "blocked");
    assert.equal(response.body[1].stepId, "publish_and_open");

    const detailResponse = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(detailResponse.status, HttpStatus.OK);
    assert.equal(
      detailResponse.body.validationRehearsal.steps.find(
        (step: { id: string }) => step.id === "local_bet_and_sync",
      )?.commands.includes("POST /arena/internal/validation-chain/sync"),
      true,
    );
    assert.equal(
      Array.isArray(
        detailResponse.body.validationRehearsal.environmentReadiness
          .blockingDependencies,
      ),
      true,
    );
    assert.equal(
      detailResponse.body.validationRehearsal.summary.latestCheckpointStepId,
      "local_bet_and_sync",
    );
    assert.equal(
      detailResponse.body.validationRehearsal.summary.currentStepId,
      "publish_and_open",
    );
    assert.equal(detailResponse.body.validationRehearsalCheckpoints.length, 2);
  });
});

test("reward payout confirm execution route completes an executing payout from its recorded transaction hash", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    await harness.userRepository.create({
      id: "http_reward_confirm_user",
      primaryWalletAddress: "0x00000000000000000000000000000000000000c1",
      normalizedPrimaryWalletAddress:
        "0x00000000000000000000000000000000000000c1",
      status: "active",
    } as never);

    const proposition = await createLiveProposition(harness, {
      title: "HTTP reward confirm execution proposition",
    });
    const response = await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId: "http_reward_confirm_user",
      minuteOffset: 26,
      reviewStatus: "valid",
    });
    const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
      response.id,
    );
    assert.ok(ledger);

    await requestJson(
      baseUrl,
      `/arena/internal/rewards/${ledger!.id}/approve-payout`,
      {
        method: "POST",
        body: {
          approvedAt: arenaTime(27),
          reason: "operator_approved_reward_payout",
        },
        user: {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        },
      },
    );

    await requestJson(
      baseUrl,
      `/arena/internal/rewards/${ledger!.id}/start-payout-execution`,
      {
        method: "POST",
        body: {
          startedAt: arenaTime(28),
          reason: "wallet_transfer_broadcast_started",
        },
        user: {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        },
      },
    );

    const confirmResponse = await requestJson(
      baseUrl,
      `/arena/internal/rewards/${ledger!.id}/confirm-payout-execution`,
      {
        method: "POST",
        body: {
          confirmedAt: arenaTime(29),
          reason: "wallet_transfer_chain_confirmed",
          externalReference: "http_confirm_001",
        },
        user: {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(confirmResponse.status, HttpStatus.CREATED);
    assert.equal(confirmResponse.body.payout.status, "completed");
    assert.equal(
      confirmResponse.body.payout.executionTxHash,
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
    assert.equal(
      confirmResponse.body.payout.externalReference,
      "http_confirm_001",
    );
  });
});

test("validation chain runtime readiness route exposes deployment preflight state to operators", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/validation-chain/runtime-readiness",
      {
        method: "GET",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.validationEnvironment, "local");
    assert.equal(
      response.body.dependencies.find((item: { name: string }) => item.name === "validation_contract")?.status,
      "up",
    );
  });
});

test("validation chain runtime readiness route still returns degraded snapshots for operator diagnosis", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(InternalMonitoringService)
      .getValidationChainRuntimeReadiness = async () => ({
      status: "degraded",
      checkedAt: "2026-04-24T00:36:00.000Z",
      validationEnvironment: "staging",
      chainId: 8453,
      rpcUrl: "https://rpc.example",
      arenaContractAddress: "0x0000000000000000000000000000000000000001",
      validationContractAddress: "0x0000000000000000000000000000000000000002",
      dependencies: [
        { name: "env", status: "up" },
        { name: "database", status: "up" },
        { name: "redis", status: "up" },
        { name: "rpc", status: "down", details: "timeout" },
        { name: "validation_contract_code", status: "up" },
        { name: "validation_contract_bytecode", status: "up" },
        { name: "validation_operator_signer", status: "up" },
        { name: "validation_oracle_signer", status: "up" },
        { name: "validation_pauser_signer", status: "up" },
      ],
      requiredEnvKeys: ["DATABASE_URL", "REDIS_URL", "RPC_URL"],
      optionalEnvKeys: ["ARENA_VALIDATION_OPERATOR_ADDRESS"],
      preflightCommands: ["pnpm run validation:env:check"],
      runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
      operatorActions: [
        {
          dependency: "rpc",
          summary: "Restore RPC connectivity and confirm the configured chain id matches the provider.",
          envKeys: ["RPC_URL", "CHAIN_ID"],
          commands: ["pnpm run validation:deps:check", "pnpm run validation:chain:check"],
        },
      ],
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/validation-chain/runtime-readiness",
      {
        method: "GET",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.status, "degraded");
    assert.equal(
      response.body.dependencies.find((item: { name: string }) => item.name === "rpc")?.details,
      "timeout",
    );
    assert.equal(response.body.operatorActions[0]?.dependency, "rpc");
  });
});

test("validation chain health route exposes current operator summary alongside raw monitoring fields", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(InternalMonitoringService)
      .getValidationChainHealth = async () => ({
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      syncStatus: "idle",
      lastProcessedBlock: 118,
      lastProcessedTxHash: "0x10",
      lastProcessedLogIndex: 0,
      lastFinalizedBlock: 118,
      cursorUpdatedAt: "2026-04-24T00:35:00.000Z",
      pollIntervalMs: 15000,
      cursorStaleThresholdMs: 60000,
      isCursorStalled: false,
      schedulerWorker: null,
      recentAlerts: [
        {
          action: "validation_chain.alert.stale_payouts",
          entityType: "validation_chain_stream",
          entityId: "validation_market_main",
          reason: "validation_chain.payout.stale",
          metadata: {
            marketId: "market_resolved_1",
          },
          createdAt: "2026-04-24T00:59:00.000Z",
        },
      ],
      metrics: {
        recentRetryExhaustedCount: 0,
        recentTerminalCommandCount: 0,
        recentSyncFailureCount: 0,
        recentProjectorEntityMissingCount: 0,
        stalePayoutMarketCount: 1,
        unsyncedBetBacklogCount: 0,
      },
      eventLedger: {
        totalEventCount: 0,
        duplicateRows: [],
        recentEvents: [],
      },
      projection: {
        latestMarket: null,
        latestBet: null,
        unsyncedBetBacklog: [],
      },
      failures: {
        projectorFailuresCount: 0,
        syncFailuresCount: 0,
        recentFailures: [],
      },
      stalePayoutMarkets: [
        {
          marketId: "market_resolved_1",
          propositionId: "prop_1",
          chainStatus: "resolved",
          terminalAt: "2026-04-22T00:00:00.000Z",
          unclaimedBetCount: 2,
          operatorActions: [
            "POST /arena/internal/validation-chain/sync",
            "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
            "GET /arena/internal/monitoring/validation-chain",
          ],
        },
      ],
      operatorSummary: {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "stale_payouts",
        summary:
          "Stale payout recovery is required for at least one terminal market before settlement completeness can be trusted.",
        operatorActions: [
          "POST /arena/internal/validation-chain/sync",
          "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
          "GET /arena/internal/monitoring/validation-chain",
        ],
        blockers: ["stale_payouts"],
        latestRelevantEvidence: {
          action: "validation_chain.alert.stale_payouts",
          entityType: "validation_chain_stream",
          entityId: "validation_market_main",
          reason: "validation_chain.payout.stale",
          createdAt: "2026-04-24T00:59:00.000Z",
        },
      },
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/validation-chain",
      {
        method: "GET",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.operatorSummary.status, "action_required");
    assert.equal(response.body.operatorSummary.requiresActionNow, true);
    assert.equal(response.body.operatorSummary.focusArea, "stale_payouts");
    assert.equal(
      response.body.operatorSummary.operatorActions[1],
      "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
    );
    assert.equal(
      response.body.operatorSummary.latestRelevantEvidence.action,
      "validation_chain.alert.stale_payouts",
    );
  });
});

test("internal proposition evidence bundle route returns proposition export plus runtime contract snapshot", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: "HTTP evidence bundle proposition",
      marketEnabled: true,
      createdByUserId: "operator_owner",
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: proposition.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const live = await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-18T10:05:00.000Z",
      updatedByUserId: "operator_owner",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    await harness.marketRepository.update(market.id, {
      chainMarketId: `chain_market_${market.id}`,
      chainPropositionId: `chain_prop_${live.id}`,
      chainStatus: "pre_live",
      chainSyncedAt: new Date("2026-04-18T10:05:30.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "validation_market",
      entityId: market.id,
      action: "validation_chain.alert.lifecycle_drift",
      actorUserId: null,
      reason: "validation_chain.lifecycle_drift.chain_market_not_opened.queue_recovery",
      metadata: {
        propositionId: live.id,
        marketId: market.id,
        propositionStatus: "live",
        marketStatus: "live",
        localChainStatus: "pre_live",
        chainMarketId: `chain_market_${market.id}`,
        onChainState: "pre_live",
        driftReason: "chain_market_not_opened",
        operatorGuidance: {
          kind: "queue_recovery",
          summary:
            "Queue open_market to move the pre-live chain market into the live state.",
          recoveryReason: "open_pre_live_market",
          plannedCommands: ["open_market"],
          operatorActions: [
            `/arena/internal/validation-chain/propositions/${live.id}/recover-command`,
          ],
        },
      },
      createdAt: new Date("2026-04-18T10:05:40.000Z"),
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}/evidence-bundle`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.propositionId, live.id);
    assert.equal(typeof response.body.exportedAt, "string");
    assert.equal(response.body.propositionExport.proposition.id, live.id);
    assert.equal(
      response.body.propositionExport.validationLifecycle.onChainState,
      "pre_live",
    );
    assert.equal(
      response.body.propositionExport.validationLifecycle.operatorGuidance.recoveryReason,
      "open_pre_live_market",
    );
    assert.equal(
      response.body.propositionExport.validationChainActivity.driftAuditEvents[0].action,
      "validation_chain.alert.lifecycle_drift",
    );
    assert.equal(typeof response.body.runtimeContract.status, "string");
    assert.equal(
      response.body.runtimeContract.commands.validationLocalPrepare.includes(
        "pnpm run validation:prepare:local",
      ),
      true,
    );
  });
});

test("internal proposition detail route exposes proposition-scoped lifecycle recovery evidence", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const live = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "HTTP lifecycle recovery detail",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    harness.store.markets = harness.store.markets.filter((item) => item.id !== market.id);
    await harness.internalAuditService.record({
      entityType: "validation_proposition",
      entityId: live.id,
      action: "validation_chain.alert.lifecycle_drift",
      actorUserId: null,
      reason: "validation_chain.lifecycle_drift.market_missing.manual_intervention",
      metadata: {
        propositionId: live.id,
        marketId: null,
        propositionStatus: "live",
        marketStatus: null,
        localChainStatus: null,
        chainMarketId: null,
        onChainState: null,
        driftReason: "market_missing",
        operatorGuidance: {
          kind: "manual_intervention",
          summary:
            "The local validation market row is missing. Reconstruct or investigate local market state before replaying projection or queueing chain commands.",
          recoveryReason: null,
          plannedCommands: [],
          operatorActions: ["docs/contracts/arena-validation-chain-runbook.md"],
        },
      },
      createdAt: new Date("2026-04-18T10:06:20.000Z"),
    });

    const response = await requestJson(baseUrl, `/arena/internal/propositions/${live.id}`, {
      user: {
        userId: "operator_validation_chain",
        roles: [SystemRole.Operator],
      },
    });

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.market, null);
    assert.equal(response.body.validationLifecycle.driftReason, "market_missing");
    assert.equal(response.body.validationLifecycle.onChainState, null);
    assert.equal(
      response.body.validationLifecycle.operatorGuidance.kind,
      "manual_intervention",
    );
    assert.equal(
      response.body.validationChainActivity.driftAuditEvents[0].entityType,
      "validation_proposition",
    );
  });
});

test("validation lifecycle drift route exposes operator recovery and manual intervention guidance", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app.get(InternalMonitoringService).listValidationLifecycleDrift = async () => ([
      {
        propositionId: "prop_1",
        title: "Recoverable live drift",
        category: "general",
        propositionStatus: "live",
        marketId: "market_1",
        marketStatus: "live",
        chainMarketId: "chain_market_1",
        chainStatus: null,
        onChainState: null,
        chainSyncedAt: null,
        publishedAt: "2026-04-24T00:00:00.000Z",
        liveAt: "2026-04-24T00:05:00.000Z",
        frozenAt: null,
        revealStartedAt: null,
        resultComputedAt: null,
        settledAt: null,
        driftReason: "chain_market_not_created",
        operatorGuidance: {
          kind: "queue_recovery",
          summary: "Queue create_market and open_market to recreate the missing live chain market.",
          recoveryReason: "create_open_missing_market",
          plannedCommands: ["create_market", "open_market"],
          operatorActions: [
            "/arena/internal/validation-chain/propositions/prop_1/recover-command",
          ],
        },
      },
      {
        propositionId: "prop_2",
        title: "Unsafe pre-live drift",
        category: "general",
        propositionStatus: "revealing",
        marketId: "market_2",
        marketStatus: "frozen_for_reveal",
        chainMarketId: "chain_market_2",
        chainStatus: "pre_live",
        onChainState: "pre_live",
        chainSyncedAt: "2026-04-24T00:10:00.000Z",
        publishedAt: "2026-04-24T00:00:00.000Z",
        liveAt: "2026-04-24T00:05:00.000Z",
        frozenAt: "2026-04-24T00:08:00.000Z",
        revealStartedAt: "2026-04-24T00:09:00.000Z",
        resultComputedAt: "2026-04-24T00:09:30.000Z",
        settledAt: null,
        driftReason: "chain_market_not_frozen",
        operatorGuidance: {
          kind: "manual_intervention",
          summary: "Do not reopen a pre-live chain market after the local freeze boundary.",
          recoveryReason: null,
          plannedCommands: [],
          operatorActions: [
            "/arena/internal/validation-chain/propositions/prop_2/cancel-market",
            "docs/contracts/arena-validation-chain-runbook.md#unsafe-pre-live-drift-policy",
          ],
        },
      },
    ]);

    const response = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/validation-lifecycle-drift",
      {
        method: "GET",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.length, 2);
    assert.equal(response.body[0].operatorGuidance.kind, "queue_recovery");
    assert.equal(response.body[0].operatorGuidance.recoveryReason, "create_open_missing_market");
    assert.deepEqual(response.body[0].operatorGuidance.plannedCommands, [
      "create_market",
      "open_market",
    ]);
    assert.equal(response.body[1].operatorGuidance.kind, "manual_intervention");
    assert.equal(response.body[1].operatorGuidance.recoveryReason, null);
    assert.equal(
      response.body[1].operatorGuidance.operatorActions.includes(
        "docs/contracts/arena-validation-chain-runbook.md#unsafe-pre-live-drift-policy",
      ),
      true,
    );
  });
});

test("runtime contract route exposes a unified backend deployment contract to operators", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app.get(InternalMonitoringService).getRuntimeContract = async () => ({
      status: "degraded",
      generatedAt: "2026-05-24T00:36:00.000Z",
      environment: {
        nodeEnv: "production",
        validationEnvironment: "staging",
        port: 4000,
      },
      health: {
        live: {
          status: "ok",
          timestamp: "2026-05-24T00:36:00.000Z",
        },
        readiness: {
          status: "degraded",
          timestamp: "2026-05-24T00:36:00.000Z",
          dependencies: [
            { name: "database", status: "up" },
            { name: "redis", status: "up" },
            { name: "rpc", status: "up" },
            { name: "scheduler_queue", status: "down", details: "scheduler queue worker is disconnected" },
          ],
        },
        queues: createQueueOverviewSnapshot({
          schedulerStatus: "down",
          schedulerDetails: "scheduler queue worker is disconnected",
        }),
      },
      validationChain: {
        status: "degraded",
        checkedAt: "2026-05-24T00:36:00.000Z",
        validationEnvironment: "staging",
        chainId: 8453,
        rpcUrl: "https://rpc.example",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        dependencies: [
          { name: "env", status: "up" },
          { name: "database", status: "up" },
          { name: "redis", status: "up" },
          { name: "rpc", status: "down", details: "timeout" },
        ],
        requiredEnvKeys: ["DATABASE_URL", "REDIS_URL", "RPC_URL"],
        optionalEnvKeys: ["ARENA_VALIDATION_OPERATOR_ADDRESS"],
        preflightCommands: ["pnpm run validation:env:check"],
        runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
        operatorActions: [
          {
            dependency: "rpc",
            summary: "Restore RPC connectivity and confirm the configured chain id matches the provider.",
            envKeys: ["RPC_URL", "CHAIN_ID"],
            commands: ["pnpm run validation:deps:check", "pnpm run validation:chain:check"],
          },
        ],
      },
      validationRehearsal: {
        status: "blocked",
        targetOutcome:
          "One proposition completes publish -> local bet -> on-chain placeBet -> manual or scheduled sync -> projection -> settlement against deployed validation infrastructure.",
        runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
        blockingDependencies: ["scheduler_queue", "rpc"],
        steps: [
          {
            id: "preflight",
            summary:
              "Clear backend, queue, database, Redis, RPC, signer, and contract blockers before attempting an environment-backed validation rehearsal.",
            commands: ["GET /arena/internal/monitoring/runtime-contract"],
            evidence: ["GET /health/ready"],
          },
        ],
      },
      validationProofRecord: null,
      commands: {
        install: ["pnpm install", "pnpm run deps:up"],
        dev: ["pnpm run api:dev"],
        typecheck: ["pnpm run api:typecheck"],
        unitTest: ["pnpm --filter @arena/shared test"],
        integrationTest: ["pnpm --filter @arena/api test:arena"],
        e2eOrSmoke: ["pnpm run validation:test"],
        productionBuild: ["pnpm run backend:build"],
        validationLocalPrepare: ["pnpm run validation:prepare:local"],
        databaseMigrate: ["pnpm run api:prisma:deploy", "pnpm run validation:db:deploy"],
        preflight: ["pnpm run validation:preflight"],
      },
      releaseReadiness: {
        status: "blocked",
        blockingDependencies: ["scheduler_queue", "rpc"],
        completedGateCount: 2,
        totalGateCount: 3,
      },
      releaseChecklist: [
        {
          id: "env",
          status: "ready",
          summary: "Populate required backend and validation-chain environment variables.",
          blockingDependencies: [],
          commands: ["pnpm run validation:env:check"],
          operatorActions: [],
        },
        {
          id: "readiness",
          status: "blocked",
          summary: "Verify public and validation runtime readiness before accepting traffic.",
          blockingDependencies: ["scheduler_queue"],
          commands: ["GET /health/ready", "GET /arena/internal/monitoring/validation-chain/runtime-readiness"],
          operatorActions: [
            "GET /system/queues/overview",
            "GET /arena/internal/monitoring/validation-chain",
          ],
        },
      ],
      recentAlerts: [
        {
          id: "internal_audit_1",
          entityType: "runtime_contract",
          entityId: "release",
          action: "runtime_contract.alert.release_blocked",
          actorUserId: null,
          reason: "runtime_contract.release_blocked",
          note: null,
          metadata: {
            blockingDependencies: ["scheduler_queue", "rpc"],
          },
          createdAt: "2026-05-24T00:35:00.000Z",
        },
      ],
      operatorSummary: {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "readiness",
        summary:
          "Release is blocked at readiness: Verify public and validation runtime readiness before accepting traffic.",
        operatorActions: [
          "GET /system/queues/overview",
          "GET /arena/internal/monitoring/validation-chain",
        ],
        blockers: ["scheduler_queue", "rpc"],
        latestRelevantEvidence: {
          action: "runtime_contract.alert.release_blocked",
          entityType: "runtime_contract",
          entityId: "release",
          reason: "runtime_contract.release_blocked",
          createdAt: "2026-05-24T00:35:00.000Z",
        },
      },
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/runtime-contract",
      {
        method: "GET",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.status, "degraded");
    assert.equal(response.body.environment.nodeEnv, "production");
    assert.equal(
      response.body.health.readiness.dependencies.find(
        (item: { name: string }) => item.name === "scheduler_queue",
      )?.status,
      "down",
    );
    assert.equal(
      response.body.validationChain.runbookPath,
      "docs/contracts/arena-validation-chain-runbook.md",
    );
    assert.equal(response.body.validationRehearsal.status, "blocked");
    assert.equal(
      response.body.commands.preflight.includes("pnpm run validation:preflight"),
      true,
    );
    assert.deepEqual(response.body.commands.validationLocalPrepare, [
      "pnpm run validation:prepare:local",
    ]);
    assert.equal(response.body.releaseReadiness.status, "blocked");
    assert.equal(
      response.body.releaseChecklist.some((item: { id: string }) => item.id === "readiness"),
      true,
    );
    assert.equal(
      response.body.releaseChecklist.find((item: { id: string }) => item.id === "readiness")
        ?.status,
      "blocked",
    );
    assert.equal(
      response.body.releaseChecklist.find((item: { id: string }) => item.id === "readiness")
        ?.operatorActions.includes("GET /system/queues/overview"),
      true,
    );
    assert.equal(response.body.recentAlerts[0]?.action, "runtime_contract.alert.release_blocked");
    assert.equal(response.body.operatorSummary.status, "action_required");
    assert.equal(response.body.operatorSummary.focusArea, "readiness");
    assert.equal(
      response.body.operatorSummary.latestRelevantEvidence.action,
      "runtime_contract.alert.release_blocked",
    );
  });
});

test("validation chain internal command recovery route allows operator queue recovery calls", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/recover-command",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_command_recovery",
          note: "recover_runtime_commands",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.marketId, "market_1");
    assert.deepEqual(response.body.plannedCommands, [
      "freeze_market",
      "resolve_market",
    ]);
    assert.equal(response.body.recoveryReason, "freeze_resolve_live_market");
  });
});

test("validation chain internal command recovery route can return settled resolve-only recovery plans", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(ValidationChainCommandRecoveryService)
      .recoverQueuedCommands = async () => ({
      propositionId: "prop_1",
      marketId: "market_1",
      chainMarketId: "chain_market_1",
      chainPropositionId: "chain_prop_1",
      queuedAt: "2026-04-24T00:36:00.000Z",
      requestStatus: "queued",
      propositionStatus: "settled",
      marketStatus: "settled",
      localChainStatus: "frozen",
      onChainState: "frozen",
      driftReason: "chain_market_not_resolved",
      recoveryReason: "resolve_settled_market",
      plannedCommands: ["resolve_market"],
      commandSubmissions: [
        {
          command: "resolve_market",
          status: "enqueued",
          queueJobId: "validation-chain.resolve_market.prop_1",
          delayMs: 5000,
          errorMessage: null,
        },
      ],
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/recover-command",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_command_recovery",
          note: "resolve_settled_drift",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.propositionStatus, "settled");
    assert.equal(response.body.recoveryReason, "resolve_settled_market");
    assert.deepEqual(response.body.plannedCommands, ["resolve_market"]);
  });

test("validation chain internal command recovery route returns 200 when recovery reuses pending jobs", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(ValidationChainCommandRecoveryService)
      .recoverQueuedCommands = async () => ({
      propositionId: "prop_1",
      marketId: "market_1",
      chainMarketId: "chain_market_1",
      chainPropositionId: "chain_prop_1",
      queuedAt: "2026-04-24T00:36:00.000Z",
      requestStatus: "already_pending",
      propositionStatus: "live",
      marketStatus: "live",
      localChainStatus: "pre_live",
      onChainState: "pre_live",
      driftReason: "chain_market_not_opened",
      recoveryReason: "open_pre_live_market",
      plannedCommands: ["open_market"],
      commandSubmissions: [
        {
          command: "open_market",
          status: "already_pending",
          queueJobId: "validation-chain.open_market.prop_1",
          delayMs: 5000,
          errorMessage: null,
        },
      ],
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/recover-command",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_command_recovery",
          note: "reuse_pending_job",
        },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(response.body.requestStatus, "already_pending");
    assert.equal(response.body.commandSubmissions[0]?.status, "already_pending");
  });
});

test("validation chain internal command recovery route returns 503 with structured submission results when queueing fails", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(ValidationChainCommandRecoveryService)
      .recoverQueuedCommands = async () => ({
      propositionId: "prop_1",
      marketId: "market_1",
      chainMarketId: "chain_market_1",
      chainPropositionId: "chain_prop_1",
      queuedAt: "2026-04-24T00:36:00.000Z",
      requestStatus: "failed",
      propositionStatus: "revealing",
      marketStatus: "frozen_for_reveal",
      localChainStatus: "live",
      onChainState: "live",
      driftReason: "chain_market_not_frozen",
      recoveryReason: "freeze_resolve_live_market",
      plannedCommands: ["freeze_market", "resolve_market"],
      commandSubmissions: [
        {
          command: "freeze_market",
          status: "failed",
          queueJobId: null,
          delayMs: 0,
          errorMessage: "Redis unavailable",
        },
        {
          command: "resolve_market",
          status: "failed",
          queueJobId: null,
          delayMs: 5000,
          errorMessage: "Redis unavailable",
        },
      ],
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/recover-command",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_command_recovery",
          note: "queue_down",
        },
      },
    );

    assert.equal(response.status, HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal(response.body.requestStatus, "failed");
    assert.equal(response.body.commandSubmissions[0]?.errorMessage, "Redis unavailable");
  });
});
});

test("validation chain internal command recovery route returns 409 for invalid recovery state", async () => {
  await withHttpArenaApp(async ({ app, baseUrl }) => {
    app
      .get(ValidationChainCommandRecoveryService)
      .recoverQueuedCommands = async () => {
      throw new ArenaValidationError(
        "validation_chain.command_recovery.no_safe_plan",
        "Validation-chain command recovery cannot safely recover the current local and on-chain state combination",
      );
    };

    const response = await requestJson(
      baseUrl,
      "/arena/internal/validation-chain/propositions/prop_1/recover-command",
      {
        method: "POST",
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
        body: {
          reason: "manual_command_recovery",
          note: "unsafe_state",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.error.code,
      "validation_chain.command_recovery.no_safe_plan",
    );
  });
});

test("unexpected unhandled errors still return 500", async () => {
  await withHttpArenaApp(async ({ baseUrl }) => {
    const response = await requestJson(baseUrl, "/__test/error");

    assert.equal(response.status, HttpStatus.INTERNAL_SERVER_ERROR);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
    assert.equal(response.body.error.message, "Unhandled test error");
  });
});

test("internal state-machine conflicts also return 409 for other illegal ops actions", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${proposition.id}/emergency-freeze`,
      {
        method: "POST",
        user: {
          userId: "admin_1",
          roles: [SystemRole.Admin],
        },
        body: {
          frozenAt: "2026-04-18T10:08:00.000Z",
          reason: "smoke_test_freeze",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CONFLICT);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "ARENA_INVALID_STATE_TRANSITION");
  });
});
