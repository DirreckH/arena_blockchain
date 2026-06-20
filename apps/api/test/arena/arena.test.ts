import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SystemRole } from "@arena/shared";

import { ArenaInternalDispatchController } from "../../src/arena/internal-dispatch.controller";
import { ArenaInternalMonitoringController } from "../../src/arena/internal-monitoring.controller";
import { ArenaInternalPropositionsController } from "../../src/arena/internal-propositions.controller";
import { ArenaInternalReputationController } from "../../src/arena/internal-reputation.controller";
import { ArenaInternalRewardsController } from "../../src/arena/internal-rewards.controller";
import { ArenaInternalTagsController } from "../../src/arena/internal-tags.controller";
import { ArenaInternalValidationChainController } from "../../src/arena/internal-validation-chain.controller";
import { ArenaDiscussionController } from "../../src/arena/discussion.controller";
import { ArenaIdService } from "../../src/arena/arena-id.service";
import { ArenaPublicController } from "../../src/arena/public.controller";
import { ArenaPublicDiscoveryController } from "../../src/arena/public-discovery.controller";
import { ArenaRespondentAccountController } from "../../src/arena/respondent-account.controller";
import { ArenaRespondentResultsController } from "../../src/arena/respondent-results.controller";
import { ArenaRespondentReputationController } from "../../src/arena/respondent-reputation.controller";
import { ArenaRespondentRewardsController } from "../../src/arena/respondent-rewards.controller";
import { ArenaRespondentTagsController } from "../../src/arena/respondent-tags.controller";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { ArenaConflictError, ArenaValidationError } from "../../src/arena/arena.errors";
import { assertDispatchTaskTransition } from "../../src/arena/state-machines/dispatch-task-state.machine";
import { assertMarketTransition } from "../../src/arena/state-machines/market-state.machine";
import { assertPropositionTransition } from "../../src/arena/state-machines/proposition-state.machine";
import { assertResponseReviewTransition } from "../../src/arena/state-machines/response-review-state.machine";
import { assertRewardLedgerTransition } from "../../src/arena/state-machines/reward-ledger-state.machine";
import { AdjudicationViewService } from "../../src/arena/services/adjudication-view.service";
import { AccountViewService } from "../../src/arena/services/account-view.service";
import { DiscoveryConfigService } from "../../src/arena/services/discovery-config.service";
import { PublicDiscoveryService } from "../../src/arena/services/public-discovery.service";
import { PublicRespondentLeaderboardService } from "../../src/arena/services/public-respondent-leaderboard.service";
import { PublicIntegrityViewService } from "../../src/arena/services/public-integrity-view.service";
import { PublicResultViewService } from "../../src/arena/services/public-result-view.service";
import { RESPONSE_REVIEW_CLAIM_TTL_SECONDS } from "../../src/arena/services/response-review.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
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
  ValidationContractMarketState,
} from "../../src/arena/validation-chain/validation-chain.types";
import { createArenaHarness } from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "dao"
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
  sampleConstraints: [] as string[],
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

async function createLiveProposition(
  harness: ReturnType<typeof createArenaHarness>,
  overrides: Partial<typeof propositionDraftInput> = {},
) {
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
}

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.parse("2026-04-18T10:06:00.000Z") +
      minuteOffset * 60_000 +
      secondOffset * 1000,
  ).toISOString();

const defaultReasonCodesByStatus = {
  valid: ["passes_quality_review"],
  partial_valid: ["attention_mismatch"],
  invalid: ["integrity_violation"],
  fraud_suspected: ["fraud_signal_detected"],
} as const;

const INTERNAL_IDENTITY_KEYS = [
  "userId",
  "createdByUserId",
  "updatedByUserId",
  "reviewedByUserId",
] as const;

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

function createValidationChainRuntimeRecorder() {
  const createOpenCalls: Array<Record<string, unknown>> = [];
  const freezeCalls: Array<Record<string, unknown>> = [];
  const resolveCalls: Array<Record<string, unknown>> = [];

  return {
    createOpenCalls,
    freezeCalls,
    resolveCalls,
    async enqueueCreateOpenCommands(input: Record<string, unknown>) {
      createOpenCalls.push({ ...input });
    },
    async enqueueFreezeCommand(input: Record<string, unknown>) {
      freezeCalls.push({ ...input });
    },
    async enqueueResolveCommand(input: Record<string, unknown>) {
      resolveCalls.push({ ...input });
    },
  };
}

function createValidationChainContractStub() {
  const txCounter = {
    value: 0,
  };
  const chainMarkets = new Map<
    string,
    {
      propositionId: string;
      state: ValidationContractMarketState;
    }
  >();
  let paused = false;

  const nextTxHash = () => {
    txCounter.value += 1;
    return `0x${txCounter.value.toString(16).padStart(64, "0")}`;
  };

  return {
    chainMarkets,
    getContractAddress() {
      return "0xvalidationcontract";
    },
    async getMarketOrNull(marketId: string) {
      const market = chainMarkets.get(marketId);
      if (!market) {
        return null;
      }

      return {
        marketId,
        propositionId: market.propositionId,
        state: market.state,
        minStake: "10",
        resultKind: 0,
        winningOption: 0,
        voidReason: 0,
        openedAt: 0,
        frozenAt: 0,
        resolvedAt: 0,
        cancelledAt: 0,
        cancelReasonCode: "",
      };
    },
    async sendCreateMarket(
      marketId: string,
      propositionId: string,
    ) {
      chainMarkets.set(marketId, {
        propositionId,
        state: ValidationContractMarketState.PreLive,
      });
      return { hash: nextTxHash() };
    },
    async sendOpenMarket(marketId: string) {
      const market = chainMarkets.get(marketId);
      if (!market) {
        throw new ValidationChainContractError("openMarket", "MarketNotFound");
      }
      market.state = ValidationContractMarketState.Live;
      return { hash: nextTxHash() };
    },
    async sendFreezeMarket(marketId: string) {
      const market = chainMarkets.get(marketId);
      if (!market) {
        throw new ValidationChainContractError("freezeMarket", "MarketNotFound");
      }
      market.state = ValidationContractMarketState.Frozen;
      return { hash: nextTxHash() };
    },
    async sendCancelMarket(marketId: string) {
      const market = chainMarkets.get(marketId);
      if (!market) {
        throw new ValidationChainContractError("cancelMarket", "MarketNotFound");
      }
      market.state = ValidationContractMarketState.Cancelled;
      return { hash: nextTxHash() };
    },
    async sendResolveMarket(payload: { marketId: string }) {
      const market = chainMarkets.get(payload.marketId);
      if (!market) {
        throw new ValidationChainContractError("resolveMarket", "MarketNotFound");
      }
      market.state = ValidationContractMarketState.Resolved;
      return { hash: nextTxHash() };
    },
    async isPaused() {
      return paused;
    },
    async sendPause() {
      paused = true;
      return { hash: nextTxHash() };
    },
    async sendUnpause() {
      paused = false;
      return { hash: nextTxHash() };
    },
  };
}

async function createSubmittedResponse(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    userId: string;
    category?:
      | "general"
      | "dao"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment";
    minuteOffset: number;
  },
) {
  const proposition = await createLiveProposition(harness, {
    category: input.category ?? "general",
    title: `Tagged proposition ${input.userId} ${input.minuteOffset}`,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: [input.userId],
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 10),
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(input.minuteOffset, 10),
    clientSubmittedAt: arenaTime(input.minuteOffset, 20),
    understandingAck: true,
    submittedAt: arenaTime(input.minuteOffset, 20),
  });

  return { proposition, task, response };
}

async function createReviewedResponse(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    userId: string;
    category?:
      | "general"
      | "dao"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment";
    minuteOffset: number;
    reviewStatus?: "valid" | "partial_valid" | "invalid" | "fraud_suspected";
    flags?: string[];
    reasonCodes?: string[];
  },
) {
  const created = await createSubmittedResponse(harness, input);
  const reviewStatus = input.reviewStatus ?? "valid";

  await harness.responseReviewService.finalizeReviewResult({
    responseId: created.response.id,
    status: reviewStatus,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore:
      reviewStatus === "valid" ? 100 : reviewStatus === "partial_valid" ? 60 : 0,
    flags: [...(input.flags ?? [])],
    reasonCodes: [...(input.reasonCodes ?? defaultReasonCodesByStatus[reviewStatus])],
  });

  return created;
}

async function createReviewedResponseForProposition(
  harness: ReturnType<typeof createArenaHarness>,
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
    taskId: task!.id,
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
    qualityScore:
      input.reviewStatus === "valid"
        ? 100
        : input.reviewStatus === "partial_valid"
          ? 60
          : 0,
    flags: [...(input.flags ?? [])],
    reasonCodes: [
      ...(input.reasonCodes ?? defaultReasonCodesByStatus[input.reviewStatus]),
    ],
  });

  return response;
}

function createPublicController(harness: ReturnType<typeof createArenaHarness>) {
  const publicResultViews = new PublicResultViewService(
    harness.propositionRepository as any,
    harness.marketRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
  );

  return new ArenaPublicController(
    harness.counterService,
    new ValidationViewService(
      harness.config as any,
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
    publicResultViews,
    new PublicIntegrityViewService(
      harness.propositionRepository as any,
      harness.counterService as any,
      publicResultViews as any,
    ),
  );
}

async function createParticipationHistory(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    userId: string;
    category:
      | "general"
      | "dao"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment";
    count: number;
    startMinuteOffset: number;
  },
) {
  for (let index = 0; index < input.count; index += 1) {
    await createSubmittedResponse(harness, {
      userId: input.userId,
      category: input.category,
      minuteOffset: input.startMinuteOffset + index,
    });
  }
}

async function createReviewedHistory(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    userId: string;
    category:
      | "general"
      | "dao"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment";
    count: number;
    startMinuteOffset: number;
    reviewStatus: "valid" | "partial_valid" | "invalid" | "fraud_suspected";
    flags?: string[];
  },
) {
  for (let index = 0; index < input.count; index += 1) {
    await createReviewedResponse(harness, {
      userId: input.userId,
      category: input.category,
      minuteOffset: input.startMinuteOffset + index,
      reviewStatus: input.reviewStatus,
      flags: input.flags,
    });
  }
}

test("Proposition state machine accepts legal transitions and rejects illegal ones", () => {
  assert.doesNotThrow(() =>
    assertPropositionTransition("draft", "scheduled", "schedule"),
  );
  assert.doesNotThrow(() =>
    assertPropositionTransition("live", "frozen", "freeze"),
  );
  assert.throws(() =>
    assertPropositionTransition("live", "settled", "markSettled"),
  );
});

test("DispatchTask state machine accepts legal transitions and rejects illegal ones", () => {
  assert.doesNotThrow(() =>
    assertDispatchTaskTransition("assigned", "started", "startTask"),
  );
  assert.throws(() =>
    assertDispatchTaskTransition("submitted", "assigned", "restartTask"),
  );
});

test("ResponseReview state machine accepts legal transitions and rejects illegal ones", () => {
  assert.doesNotThrow(() =>
    assertResponseReviewTransition(
      "pending_review",
      "valid",
      "finalizeReview",
    ),
  );
  assert.throws(() =>
    assertResponseReviewTransition("valid", "invalid", "reReview"),
  );
});

test("Market state machine accepts legal transitions and rejects illegal ones", () => {
  assert.doesNotThrow(() =>
    assertMarketTransition("pre_live", "live", "activateMarket"),
  );
  assert.throws(() =>
    assertMarketTransition("live", "settled", "settleMarket"),
  );
});

test("RewardLedger state machine accepts legal transitions and rejects illegal ones", () => {
  assert.doesNotThrow(() =>
    assertRewardLedgerTransition("pending", "finalized", "resolveReward"),
  );
  assert.throws(() =>
    assertRewardLedgerTransition("pending", "reversed", "reverseReward"),
  );
});

test("createProposition accepts a legal binary non_rolling single-question proposition", async () => {
  const harness = createArenaHarness();

  const proposition = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    marketEnabled: true,
  });

  assert.equal(proposition.status, "draft");
  assert.equal(proposition.type, "consensus");
  assert.equal(proposition.structure, "binary");
  assert.equal(proposition.rollingMode, "non_rolling");
  assert.equal(proposition.marketEnabled, true);
});

test("createProposition and scheduling provision creator and operator identities", async () => {
  const harness = createArenaHarness();

  const proposition = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    createdByUserId: "creator_identity_1",
  });

  assert.equal(
    (await harness.userRepository.findById("creator_identity_1"))?.id,
    "creator_identity_1",
  );

  await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: proposition.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "operator_identity_1",
  });

  assert.equal(
    (await harness.userRepository.findById("operator_identity_1"))?.id,
    "operator_identity_1",
  );
});

test("internal proposition rejection provisions missing operator identity", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );

  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    createdByUserId: "creator_reject_identity",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: draft.id,
    userId: "creator_reject_identity",
    note: "ready_for_rejection",
  });

  await controller.rejectProposition(
    draft.id,
    {
      rejectedAt: "2026-04-18T10:01:00.000Z",
      reason: "duplicate_scope",
      note: "identity_backfill_guard",
    } as any,
    { user: { sub: "reject_operator_identity_1" } } as any,
  );

  assert.equal(
    (await harness.userRepository.findById("reject_operator_identity_1"))?.id,
    "reject_operator_identity_1",
  );
});

test("createProposition rejects invalid option counts", async () => {
  const harness = createArenaHarness();

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        options: ["A", "B", "C"] as unknown as [string, string],
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.invalid_options",
  );
});

test("createProposition rejects rolling and survey or hybrid inputs", async () => {
  const harness = createArenaHarness();

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        marketEnabled: true,
        rollingMode: "rolling",
      } as typeof propositionDraftInput & { rollingMode: string }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.unsupported_rolling_mode",
  );

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        marketEnabled: true,
        questions: [{ id: "q1" }],
      } as typeof propositionDraftInput & { questions: unknown[] }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.unsupported_multi_question",
  );

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        marketEnabled: true,
        hybridConfig: { enabled: true },
      } as typeof propositionDraftInput & { hybridConfig: Record<string, boolean> }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.unsupported_extension_field",
  );
});

test("createProposition rejects invalid duration and sample configuration", async () => {
  const harness = createArenaHarness();

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        minEffectiveSample: 0,
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.invalid_min_effective_sample",
  );

  await assert.rejects(
    () =>
      harness.propositionEngineService.createProposition({
        ...propositionDraftInput,
        minDurationSeconds: 10,
        maxDurationSeconds: 9,
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      (error.code === "proposition.invalid_min_duration" ||
        error.code === "proposition.invalid_duration_range"),
  );
});

test("proposition engine moves proposition from draft to scheduled to live", async () => {
  const harness = createArenaHarness();

  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });
  const live = await harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });

  assert.equal(draft.status, "draft");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(live.status, "live");
});

test("publishLiveProposition performs validation-layer readiness checks when marketEnabled=true", async () => {
  const harness = createArenaHarness();

  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    marketEnabled: true,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });

  const market = await harness.marketRepository.findByPropositionId(draft.id);
  assert.equal(market?.status, "live");

  const invalidDraft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    marketEnabled: true,
  });
  const invalidScheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: invalidDraft.id,
      publishedAt: "2026-04-18T10:10:00.000Z",
      updatedByUserId: "admin_1",
    });

  await assert.rejects(
    () =>
      harness.propositionEngineService.publishLiveProposition({
        propositionId: invalidScheduled.id,
        liveAt: "2026-04-18T10:05:00.000Z",
        updatedByUserId: "admin_1",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.live_before_publish",
  );
});

test("getPropositionRuntimeSnapshot returns a stable runtime view", async () => {
  const harness = createArenaHarness();
  const live = await createLiveProposition(harness, {
    marketEnabled: true,
  });

  const snapshot = await harness.propositionEngineService.getPropositionRuntimeSnapshot(
    live.id,
  );

  assert.deepEqual(snapshot, {
    propositionId: live.id,
    type: "consensus",
    structure: "binary",
    rollingMode: "non_rolling",
    settlementTarget: "final",
    category: "general",
    title: live.title,
    description: live.description,
    options: ["A", "B"],
    marketEnabled: true,
    status: "live",
    timeRules: {
      publishedAt: "2026-04-18T10:00:00.000Z",
      liveAt: "2026-04-18T10:05:00.000Z",
      minDurationSeconds: 60,
      maxDurationSeconds: 3600,
    },
    sampleRules: {
      minEffectiveSample: 3,
      sampleConstraints: [],
    },
    rewardPolicy: {
      rewardBudget: "1000",
      baseResponseReward: "20",
    },
    validationRuntime: {
      enabled: true,
      marketId: "market_1",
      marketStatus: "live",
    },
  });
});

test("live proposition can create dispatch tasks and respondent only sees isolated own tasks", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });

  const tasks = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_1", "user_2"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.status, "assigned");

  const userOneViews = await harness.dispatchEngineService.listAssignedTasksForUser(
    "user_1",
  );
  assert.equal(userOneViews.length, 1);
  assert.equal(userOneViews[0]?.taskId, tasks[0]?.id);
  assert.equal(userOneViews[0]?.propositionId, proposition.id);
  assert.equal(userOneViews[0]?.taskStatus, "assigned");
  assert.equal(userOneViews[0]?.hasSubmitted, false);
  assert.equal("marketStatus" in (userOneViews[0] ?? {}), false);
  assert.equal("currentPublicProgress" in (userOneViews[0] ?? {}), false);
  assert.equal("leadingOption" in (userOneViews[0] ?? {}), false);

  const replayed = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_1"],
    assignedAt: "2026-04-18T10:07:00.000Z",
    expiresAt: "2026-04-18T10:17:00.000Z",
  });

  assert.deepEqual(replayed, []);
});

test("non-live proposition cannot create dispatch tasks", async () => {
  const harness = createArenaHarness();
  const proposition = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
  });

  await assert.rejects(
    () =>
      harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: proposition.id,
        userIds: ["user_1"],
        assignedAt: "2026-04-18T10:06:00.000Z",
        expiresAt: "2026-04-18T10:16:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "dispatch_task.proposition_not_live",
  );
});

test("assigned task can start while expired tasks cannot be started or submitted", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_1"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const started = await harness.dispatchEngineService.startTask({
    taskId: task.id,
    userId: "user_1",
    startedAt: "2026-04-18T10:06:10.000Z",
  });
  assert.equal(started.status, "started");

  const [expiringTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["user_2"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
  const expired = await harness.dispatchEngineService.expireTask({
    taskId: expiringTask.id,
    expiredAt: "2026-04-18T10:16:00.000Z",
    expiryReason: "ttl_elapsed",
  });
  assert.equal(expired.status, "expired");

  await assert.rejects(
    () =>
      harness.dispatchEngineService.startTask({
        taskId: expiringTask.id,
        userId: "user_2",
        startedAt: "2026-04-18T10:16:10.000Z",
      }),
    (error: unknown) => error instanceof Error,
  );

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: expiringTask.id,
        userId: "user_2",
        selectedOption: 0,
        confirmationOption: 0,
        clientStartedAt: "2026-04-18T10:16:10.000Z",
        clientSubmittedAt: "2026-04-18T10:16:20.000Z",
        submittedAt: "2026-04-18T10:16:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "response.task_not_submittable",
  );
});

test("submitResponse enforces task ownership and proposition options", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_1"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: task.id,
        userId: "user_2",
        selectedOption: 0,
        confirmationOption: 0,
        clientStartedAt: "2026-04-18T10:06:10.000Z",
        clientSubmittedAt: "2026-04-18T10:06:20.000Z",
        submittedAt: "2026-04-18T10:06:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "response.task_mismatch",
  );

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: task.id,
        userId: "user_1",
        selectedOption: 2 as 0 | 1,
        confirmationOption: 2 as 0 | 1,
        clientStartedAt: "2026-04-18T10:06:10.000Z",
        clientSubmittedAt: "2026-04-18T10:06:20.000Z",
        submittedAt: "2026-04-18T10:06:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) => error instanceof ArenaValidationError,
  );
});

test("submitResponse stores one latest response, marks task submitted and opens pending review without side effects", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_valid"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user_valid",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  assert.equal(response.responseVersion, 1);
  assert.equal(response.isLatest, true);
  assert.equal(harness.store.responses.length, 1);

  const latest = await harness.responseService.getLatestResponse(task.id);
  const byTask = await harness.responseService.getUserResponseForTask({
    taskId: task.id,
    userId: "user_valid",
  });
  const review = await harness.responseReviewRepository.findByResponseId(response.id);
  const pendingReward = await harness.rewardLedgerService.getByPropositionAndUser(
    proposition.id,
    "user_valid",
  );
  const updatedTask = await harness.dispatchTaskRepository.findById(task.id);
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  const progress = await harness.counterService.getPublicProgress(proposition.id);

  assert.equal(latest?.id, response.id);
  assert.equal(byTask?.id, response.id);
  assert.equal(updatedTask?.status, "submitted");
  assert.notEqual(updatedTask?.submittedAt, null);
  assert.equal(review?.status, "pending_review");
  assert.equal(pendingReward?.status, "pending");
  assert.equal(pendingReward?.pendingAmount, proposition.baseResponseReward);
  assert.equal(progress.progress.currentEffectiveSample, 0);
  assert.equal(progress.progress.reviewedCount, 0);
  assert.equal(progress.publicState.reachedSampleThreshold, false);
  assert.equal(harness.store.bets.length, 0);
  assert.equal(market?.status, "live");
  assert.equal(
    harness.store.propositions.find((item) => item.id === proposition.id)?.status,
    "live",
  );
});

test("response review workflow can be claimed, released, and reclaimed without finalization side effects", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["review_claim_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "review_claim_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const claimAt = new Date().toISOString();
  const releaseAt = new Date(Date.now() + 60_000).toISOString();
  const reclaimAt = new Date(Date.now() + 120_000).toISOString();

  const initialState = await harness.responseReviewService.getReviewWorkflowState(
    response.id,
  );
  const claimed = await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: claimAt,
    claimedByUserId: "operator_a",
  });
  const released = await harness.responseReviewService.releasePendingReview({
    responseId: response.id,
    releasedAt: releaseAt,
    releasedByUserId: "operator_a",
  });
  const reclaimed = await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: reclaimAt,
    claimedByUserId: "operator_b",
  });
  const pendingReward = await harness.rewardLedgerService.getByPropositionAndUser(
    proposition.id,
    "review_claim_user",
  );
  const progress = await harness.counterService.getPublicProgress(proposition.id);
  const persistedReview = await harness.responseReviewRepository.findByResponseId(
    response.id,
  );

  assert.equal(initialState.workflowState, "unclaimed");
  assert.equal(claimed.workflowState, "claimed");
  assert.equal(claimed.claimedByUserId, "operator_a");
  assert.equal(released.workflowState, "released");
  assert.equal(released.releasedByUserId, "operator_a");
  assert.equal(reclaimed.workflowState, "claimed");
  assert.equal(reclaimed.claimedByUserId, "operator_b");
  assert.equal(persistedReview?.status, "pending_review");
  assert.equal(pendingReward?.status, "pending");
  assert.equal(progress.progress.currentEffectiveSample, 0);
  assert.equal(progress.progress.reviewedCount, 0);
});

test("response review workflow provisions operator identities for claim release and finalization", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["review_identity_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "review_identity_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: "2026-04-18T10:07:00.000Z",
    claimedByUserId: "review_operator_1",
  });
  await harness.responseReviewService.releasePendingReview({
    responseId: response.id,
    releasedAt: "2026-04-18T10:08:00.000Z",
    releasedByUserId: "review_operator_1",
  });
  await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:09:00.000Z",
    reviewedByUserId: "review_operator_2",
  });

  assert.equal(
    (await harness.userRepository.findById("review_operator_1"))?.id,
    "review_operator_1",
  );
  assert.equal(
    (await harness.userRepository.findById("review_operator_2"))?.id,
    "review_operator_2",
  );
});

test("response review workflow exposes stale ownership and allows takeover", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["review_stale_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "review_stale_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const staleClaimAt = new Date(
    Date.now() - (RESPONSE_REVIEW_CLAIM_TTL_SECONDS + 60) * 1000,
  ).toISOString();
  const takeoverAt = new Date().toISOString();

  await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: staleClaimAt,
    claimedByUserId: "operator_a",
  });
  const staleState = await harness.responseReviewService.getReviewWorkflowState(
    response.id,
  );
  const takenOver = await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: takeoverAt,
    claimedByUserId: "operator_b",
  });

  assert.equal(staleState.workflowState, "expired");
  assert.equal(staleState.claimedByUserId, "operator_a");
  assert.equal(takenOver.workflowState, "claimed");
  assert.equal(takenOver.claimedByUserId, "operator_b");
  assert.equal(takenOver.isClaimStale, false);
});

test("response review finalization respects active claim ownership and clears workflow after settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["review_finalize_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "review_finalize_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const claimAt = new Date().toISOString();
  const foreignReviewAt = new Date(Date.now() + 60_000).toISOString();
  const ownerReviewAt = new Date(Date.now() + 120_000).toISOString();

  await harness.responseReviewService.claimPendingReview({
    responseId: response.id,
    claimedAt: claimAt,
    claimedByUserId: "operator_a",
  });

  await assert.rejects(
    () =>
      harness.qualityEngineService.reviewPendingResponse({
        responseId: response.id,
        reviewedAt: foreignReviewAt,
        reviewedByUserId: "operator_b",
      }),
    (error: unknown) =>
      error instanceof ArenaConflictError &&
      error.code === "response_review.review_claim_conflict",
  );

  const finalized = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: ownerReviewAt,
    reviewedByUserId: "operator_a",
  });
  const workflow = await harness.responseReviewService.getReviewWorkflowState(
    response.id,
  );

  assert.equal(finalized.status, "valid");
  assert.equal(workflow.workflowState, "finalized");
  assert.equal(workflow.finalizedReviewStatus, "valid");
  assert.equal(workflow.reviewedByUserId, "operator_a");
});

test("repeat submission is rejected in the current MVP one-task one-response strategy", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_latest_only"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user_latest_only",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: task.id,
        userId: "user_latest_only",
        selectedOption: 1,
        confirmationOption: 1,
        clientStartedAt: "2026-04-18T10:07:10.000Z",
        clientSubmittedAt: "2026-04-18T10:07:20.000Z",
        submittedAt: "2026-04-18T10:07:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) =>
      error instanceof ArenaConflictError &&
      error.code === "response.duplicate_task_submission",
  );
});

test("quality engine reviews a structurally sound response as valid and persists review fields", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["quality_valid_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "quality_valid_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const pending = await harness.qualityEngineService.listPendingReviewsByProposition(
    proposition.id,
  );
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.responseId, response.id);

  const reviewed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
  });
  const persisted = await harness.qualityEngineService.getReviewForResponse(
    response.id,
  );

  assert.equal(reviewed.status, "valid");
  assert.equal(reviewed.qualityScore, 100);
  assert.deepEqual(reviewed.flags, []);
  assert.deepEqual(reviewed.reasonCodes, ["passes_quality_checks"]);
  assert.equal(reviewed.reviewedByUserId, "reviewer_1");
  assert.notEqual(reviewed.reviewedAt, null);
  assert.equal(persisted?.status, "valid");
});

test("quality engine maps confirmation mismatch to partial_valid", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["quality_partial_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "quality_partial_user",
    selectedOption: 0,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const reviewed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
  });

  assert.equal(reviewed.status, "partial_valid");
  assert.equal(reviewed.qualityScore, 60);
  assert.ok(reviewed.flags.includes("confirmation_mismatch"));
  assert.ok(reviewed.reasonCodes.includes("confirmation_mismatch"));
});

test("quality engine flags suspicious latency and preserves decoupling from counter and closure", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["quality_fast_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "quality_fast_user",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:18.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const reviewed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
  });
  const progress = await harness.counterService.getPublicProgress(proposition.id);
  const market = await harness.marketRepository.findByPropositionId(proposition.id);

  assert.equal(reviewed.status, "partial_valid");
  assert.ok(reviewed.flags.includes("suspicious_latency"));
  assert.ok(reviewed.reasonCodes.includes("time_too_short"));
  assert.equal(progress.progress.currentEffectiveSample, 0);
  assert.equal(progress.progress.reviewedCount, 0);
  assert.equal(progress.publicState.reachedSampleThreshold, false);
  assert.equal(
    harness.store.propositions.find((item) => item.id === proposition.id)?.status,
    "live",
  );
  assert.equal(market?.status, "live");
  assert.equal(harness.store.bets.length, 0);
});

test("quality engine marks integrity violations as invalid and replay stays idempotent after finalization", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["quality_invalid_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "quality_invalid_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const storedTask = harness.store.dispatchTasks.find((item) => item.id === task.id);
  assert.ok(storedTask);
  storedTask.userId = "tampered_user";

  const reviewed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
  });
  const pendingAfterFinalize =
    await harness.qualityEngineService.listPendingReviewsByProposition(proposition.id);

  assert.equal(reviewed.status, "invalid");
  assert.equal(reviewed.qualityScore, 0);
  assert.deepEqual(reviewed.flags, ["integrity_violation"]);
  assert.deepEqual(reviewed.reasonCodes, ["integrity_violation"]);
  assert.equal(pendingAfterFinalize.length, 0);

  const replayed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_2",
  });
  const rewardLedger = await harness.rewardLedgerService.getByPropositionAndUser(
    proposition.id,
    "quality_invalid_user",
  );

  assert.equal(replayed.status, "invalid");
  assert.equal(rewardLedger?.status, "voided");
});

test("review finalization and effective sample rebuild are decoupled", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);

  const firstTask = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "user_valid",
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const secondTask = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "user_invalid",
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const validResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: firstTask.id,
    userId: "user_valid",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const invalidResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: secondTask.id,
    userId: "user_invalid",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: validResponse.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["passes_quality_bar"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: invalidResponse.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["insufficient_evidence"],
  });

  const staleProgress = await harness.counterService.getPublicProgress(
    proposition.id,
  );
  assert.equal(staleProgress.progress.currentEffectiveSample, 0);
  assert.equal(staleProgress.progress.reviewedCount, 0);

  await harness.counterService.rebuildCounter(proposition.id);
  const progress = await harness.counterService.getPublicProgress(proposition.id);
  assert.equal(progress.progress.currentEffectiveSample, 1);
  assert.equal(progress.progress.reviewedCount, 2);
  assert.equal(progress.progress.progressPercent, 33);
});

test("effective sample counter rebuild counts finalized reviews, skips pending review and stays stale before rebuild", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 3,
  });
  const [validTask, partialTask, invalidTask, pendingTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: [
        "counter_valid_user",
        "counter_partial_user",
        "counter_invalid_user",
        "counter_pending_user",
      ],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

  const validResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: validTask.id,
    userId: "counter_valid_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  const partialResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: partialTask.id,
    userId: "counter_partial_user",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  const invalidResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: invalidTask.id,
    userId: "counter_invalid_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: pendingTask.id,
    userId: "counter_pending_user",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: validResponse.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.responseReviewService.reviewPartialValid({
    responseId: partialResponse.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 60,
    flags: ["confirmation_mismatch"],
    reasonCodes: ["confirmation_mismatch"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: invalidResponse.id,
    reviewedAt: "2026-04-18T10:07:20.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 0,
    flags: ["integrity_violation"],
    reasonCodes: ["integrity_violation"],
  });

  const staleSnapshot = await harness.counterService.getCounterSnapshot(
    proposition.id,
  );
  assert.equal(staleSnapshot.totalResponses, 0);
  assert.equal(staleSnapshot.reviewedResponses, 0);
  assert.equal(staleSnapshot.validCount, 0);
  assert.equal(staleSnapshot.partialValidCount, 0);
  assert.equal(staleSnapshot.invalidCount, 0);

  const snapshot = await harness.counterService.rebuildCounterForProposition(
    proposition.id,
  );

  assert.equal(snapshot.totalResponses, 4);
  assert.equal(snapshot.reviewedResponses, 3);
  assert.equal(snapshot.validCount, 1);
  assert.equal(snapshot.partialValidCount, 1);
  assert.equal(snapshot.invalidCount, 1);
  assert.equal(snapshot.effectiveSampleCount, 2);
  assert.equal(snapshot.currentProgress, 2 / 3);
  assert.equal(snapshot.hasReachedMinEffectiveSample, false);
});

test("effective sample counter rebuild stays correct after concurrent multi-respondent submissions and review finalization", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 5,
  });
  const userIds = [
    "counter_concurrent_valid_1",
    "counter_concurrent_valid_2",
    "counter_concurrent_valid_3",
    "counter_concurrent_partial_1",
    "counter_concurrent_partial_2",
    "counter_concurrent_invalid_1",
    "counter_concurrent_invalid_2",
  ];
  const tasks = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds,
    assignedAt: arenaTime(2),
    expiresAt: arenaTime(12),
  });
  const taskByUserId = new Map(tasks.map((task) => [task.userId, task] as const));

  const responses = await Promise.all(
    userIds.map((userId, index) =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: taskByUserId.get(userId)!.id,
        userId,
        selectedOption: index % 2 === 0 ? 0 : 1,
        confirmationOption: index === 3 || index === 4 ? 1 : index % 2 === 0 ? 0 : 1,
        clientStartedAt: arenaTime(2, index),
        clientSubmittedAt: arenaTime(2, index + 10),
        submittedAt: arenaTime(2, index + 10),
        understandingAck: true,
      }),
    ),
  );
  const responseByUserId = new Map(
    responses.map((response) => [response.userId, response] as const),
  );

  await Promise.all([
    harness.responseReviewService.reviewValid({
      responseId: responseByUserId.get("counter_concurrent_valid_1")!.id,
      reviewedAt: arenaTime(3, 0),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      reasonCodes: ["passes_quality_checks"],
    }),
    harness.responseReviewService.reviewValid({
      responseId: responseByUserId.get("counter_concurrent_valid_2")!.id,
      reviewedAt: arenaTime(3, 1),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      reasonCodes: ["passes_quality_checks"],
    }),
    harness.responseReviewService.reviewValid({
      responseId: responseByUserId.get("counter_concurrent_valid_3")!.id,
      reviewedAt: arenaTime(3, 2),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      reasonCodes: ["passes_quality_checks"],
    }),
    harness.responseReviewService.reviewPartialValid({
      responseId: responseByUserId.get("counter_concurrent_partial_1")!.id,
      reviewedAt: arenaTime(3, 3),
      reviewedByUserId: "reviewer_1",
      qualityScore: 60,
      flags: ["confirmation_mismatch"],
      reasonCodes: ["confirmation_mismatch"],
    }),
    harness.responseReviewService.reviewPartialValid({
      responseId: responseByUserId.get("counter_concurrent_partial_2")!.id,
      reviewedAt: arenaTime(3, 4),
      reviewedByUserId: "reviewer_1",
      qualityScore: 60,
      flags: ["suspicious_latency"],
      reasonCodes: ["time_too_short"],
    }),
    harness.responseReviewService.reviewInvalid({
      responseId: responseByUserId.get("counter_concurrent_invalid_1")!.id,
      reviewedAt: arenaTime(3, 5),
      reviewedByUserId: "reviewer_1",
      qualityScore: 0,
      flags: ["integrity_violation"],
      reasonCodes: ["integrity_violation"],
    }),
    harness.responseReviewService.reviewInvalid({
      responseId: responseByUserId.get("counter_concurrent_invalid_2")!.id,
      reviewedAt: arenaTime(3, 6),
      reviewedByUserId: "reviewer_1",
      qualityScore: 0,
      flags: ["fraud_signal_detected"],
      reasonCodes: ["fraud_signal_detected"],
    }),
  ]);

  const [firstSnapshot, secondSnapshot] = await Promise.all([
    harness.counterService.rebuildCounterForProposition(proposition.id),
    harness.counterService.rebuildCounterForProposition(proposition.id),
  ]);

  for (const snapshot of [firstSnapshot, secondSnapshot]) {
    assert.equal(snapshot.totalResponses, 7);
    assert.equal(snapshot.reviewedResponses, 7);
    assert.equal(snapshot.validCount, 3);
    assert.equal(snapshot.partialValidCount, 2);
    assert.equal(snapshot.invalidCount, 2);
    assert.equal(snapshot.effectiveSampleCount, 5);
    assert.equal(snapshot.currentProgress, 1);
    assert.equal(snapshot.hasReachedMinEffectiveSample, true);
  }
});

test("effective sample counter is latest-only across response revisions", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 2,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["counter_latest_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const firstResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "counter_latest_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: firstResponse.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });

  await harness.responseRepository.clearLatestByPropositionAndUser(
    proposition.id,
    "counter_latest_user",
  );
  const revisedResponse = await harness.responseRepository.createVersion({
    id: "response_revision_2",
    propositionId: proposition.id,
    taskId: task.id,
    userId: "counter_latest_user",
    responsePayload: { selectedOption: 1 },
    responseVersion: 2,
    isLatest: true,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: new Date("2026-04-18T10:07:10.000Z"),
    clientSubmittedAt: new Date("2026-04-18T10:07:20.000Z"),
    understandingAck: true,
    submittedAt: new Date("2026-04-18T10:07:20.000Z"),
    createdAt: new Date("2026-04-18T10:07:20.000Z"),
    updatedAt: new Date("2026-04-18T10:07:20.000Z"),
  });
  await harness.responseReviewService.markPendingReview(revisedResponse.id);
  await harness.responseReviewService.reviewInvalid({
    responseId: revisedResponse.id,
    reviewedAt: "2026-04-18T10:08:00.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 0,
    flags: ["integrity_violation"],
    reasonCodes: ["integrity_violation"],
  });

  const snapshot = await harness.counterService.rebuildCounterForProposition(
    proposition.id,
  );

  assert.equal(harness.store.responses.length, 2);
  assert.equal(snapshot.totalResponses, 1);
  assert.equal(snapshot.reviewedResponses, 1);
  assert.equal(snapshot.validCount, 0);
  assert.equal(snapshot.partialValidCount, 0);
  assert.equal(snapshot.invalidCount, 1);
  assert.equal(snapshot.effectiveSampleCount, 0);
  assert.equal(snapshot.hasReachedMinEffectiveSample, false);
});

test("effective sample counter caps currentProgress and refreshes public progress without direction", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
  });
  const [validTask, partialTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["counter_progress_valid", "counter_progress_partial"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

  const validResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: validTask.id,
    userId: "counter_progress_valid",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  const partialResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: partialTask.id,
    userId: "counter_progress_partial",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: validResponse.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.responseReviewService.reviewPartialValid({
    responseId: partialResponse.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 60,
    flags: ["suspicious_latency"],
    reasonCodes: ["time_too_short"],
  });

  const snapshot = await harness.counterService.rebuildCounterForProposition(
    proposition.id,
  );
  const publicProgress = await harness.counterService.getPublicProgress(
    proposition.id,
  );
  const market = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  const marketProgress = market?.currentPublicProgress as
    | Record<string, unknown>
    | null;

  assert.equal(snapshot.effectiveSampleCount, 2);
  assert.equal(snapshot.currentProgress, 1);
  assert.equal(snapshot.hasReachedMinEffectiveSample, true);
  assert.equal(publicProgress.progress.progressPercent, 100);
  assert.equal(publicProgress.publicState.reachedSampleThreshold, true);
  assert.deepEqual(
    marketProgress?.progress,
    publicProgress.progress,
  );
  assert.equal("winningOption" in publicProgress, false);
  assert.equal("option0Votes" in publicProgress, false);
  assert.equal("option1Votes" in publicProgress, false);
  assert.equal("winningOption" in (marketProgress ?? {}), false);
  assert.equal("option0Votes" in (marketProgress ?? {}), false);
  assert.equal("option1Votes" in (marketProgress ?? {}), false);
});

test("counter rebuild does not trigger closure or settlement side effects", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["counter_settlement_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "counter_bettor",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:06:30.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "counter_settlement_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });

  const snapshot = await harness.counterService.rebuildCounterForProposition(
    proposition.id,
  );
  const persistedMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(snapshot.hasReachedMinEffectiveSample, true);
  assert.equal(
    harness.store.propositions.find((item) => item.id === proposition.id)?.status,
    "live",
  );
  assert.equal(persistedMarket?.status, "live");
  assert.equal(persistedMarket?.lastPublicResult, null);
  assert.equal(harness.store.bets[0]?.status, "placed");
  assert.equal(harness.store.bets[0]?.settlementOutcome, null);
});

test("freeze reveal readiness stays not_ready before minDuration and maxDuration", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    minDurationSeconds: 120,
    maxDurationSeconds: 600,
  });

  const readiness =
    await harness.freezeRevealOrchestratorService.evaluateClosureReadiness({
      propositionId: proposition.id,
      now: "2026-04-18T10:05:59.000Z",
    });

  assert.equal(readiness.isReadyToFreeze, false);
  assert.equal(readiness.triggerReason, "not_ready");
  assert.equal(readiness.minDurationReached, false);
  assert.equal(readiness.maxDurationReached, false);
  assert.equal(readiness.hasReachedMinEffectiveSample, false);

  await assert.rejects(
    () =>
      harness.freezeRevealOrchestratorService.freezeForReveal({
        propositionId: proposition.id,
        now: "2026-04-18T10:05:59.000Z",
        updatedByUserId: "admin_1",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.not_ready_for_freeze",
  );
});

test("minDuration plus reached sample can freeze, and freeze stays separate from result computation", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    minDurationSeconds: 60,
    maxDurationSeconds: 3600,
    marketEnabled: true,
  });
  const [responseTask, frozenResponseTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["freeze_ready_user", "freeze_blocked_user"],
      assignedAt: "2026-04-18T10:05:10.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: responseTask.id,
    userId: "freeze_ready_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "freeze_bettor",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });

  const readiness =
    await harness.freezeRevealOrchestratorService.evaluateClosureReadiness({
      propositionId: proposition.id,
      now: "2026-04-18T10:06:00.000Z",
    });
  assert.equal(readiness.isReadyToFreeze, true);
  assert.equal(readiness.triggerReason, "min_duration_and_sample_reached");
  assert.equal(readiness.minDurationReached, true);
  assert.equal(readiness.hasReachedMinEffectiveSample, true);

  const frozen = await harness.freezeRevealOrchestratorService.freezeForReveal({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });
  const frozenMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(frozen.status, "frozen");
  assert.equal(frozen.resultKind, null);
  assert.equal(frozen.resultComputedAt, null);
  assert.equal(frozenMarket?.status, "frozen_for_reveal");
  assert.equal(frozenMarket?.lastPublicResult, null);

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: frozenResponseTask.id,
        userId: "freeze_blocked_user",
        selectedOption: 1,
        confirmationOption: 1,
        clientStartedAt: "2026-04-18T10:06:10.000Z",
        clientSubmittedAt: "2026-04-18T10:06:20.000Z",
        submittedAt: "2026-04-18T10:06:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "response.proposition_not_live",
  );

  await assert.rejects(
    () =>
      harness.betService.placeBet({
        propositionId: proposition.id,
        marketId: market.id,
        userId: "freeze_blocked_bettor",
        selectedOption: 1,
        stakeAmount: "20",
        placedAt: "2026-04-18T10:06:20.000Z",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "bet.market_not_live",
  );
});

test("computeAndRecordOfficialResult requires frozen proposition and records official result without settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    minDurationSeconds: 60,
    maxDurationSeconds: 3600,
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["reveal_result_user"],
    assignedAt: "2026-04-18T10:05:10.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "reveal_result_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "reveal_result_bettor",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });

  await assert.rejects(
    () =>
      harness.freezeRevealOrchestratorService.computeAndRecordOfficialResult({
        propositionId: proposition.id,
        now: "2026-04-18T10:06:00.000Z",
        updatedByUserId: "admin_1",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.not_frozen",
  );

  await harness.freezeRevealOrchestratorService.freezeForReveal({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });

  const reveal =
    await harness.freezeRevealOrchestratorService.computeAndRecordOfficialResult({
      propositionId: proposition.id,
      now: "2026-04-18T10:06:30.000Z",
      updatedByUserId: "admin_1",
    });
  const storedProposition = await harness.propositionRepository.findById(
    proposition.id,
  );
  const storedMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  const publicProgress = storedMarket?.currentPublicProgress as
    | Record<string, unknown>
    | null;

  assert.equal(reveal.aggregate.resultKind, "resolved");
  assert.equal(reveal.aggregate.winningOption, 0);
  assert.equal(reveal.officialResult.resultKind, "resolved");
  assert.equal(reveal.officialResult.winningOption, 0);
  assert.equal(storedProposition?.status, "revealing");
  assert.equal(storedProposition?.resultKind, "resolved");
  assert.equal(storedProposition?.winningOption, 0);
  assert.notEqual(storedProposition?.resultComputedAt, null);
  assert.equal(storedProposition?.settledAt, null);
  assert.equal(storedMarket?.status, "frozen_for_reveal");
  assert.equal(storedMarket?.lastPublicResult, null);
  assert.equal(publicProgress?.lastPublishedResult, null);
  assert.equal(harness.store.bets[0]?.status, "placed");
  assert.equal(harness.store.bets[0]?.settlementOutcome, null);
  assert.equal("winningOption" in (publicProgress ?? {}), false);
  assert.equal("option0Votes" in (publicProgress ?? {}), false);
  assert.equal("option1Votes" in (publicProgress ?? {}), false);
});

test("maxDuration fallback and tie handling both produce official void results without settlement", async () => {
  const harness = createArenaHarness();
  const maxDurationProposition = await createLiveProposition(harness, {
    minEffectiveSample: 3,
    minDurationSeconds: 120,
    maxDurationSeconds: 180,
    marketEnabled: true,
  });

  const maxDurationReadiness =
    await harness.freezeRevealOrchestratorService.evaluateClosureReadiness({
      propositionId: maxDurationProposition.id,
      now: "2026-04-18T10:08:00.000Z",
    });
  assert.equal(maxDurationReadiness.isReadyToFreeze, true);
  assert.equal(maxDurationReadiness.triggerReason, "max_duration_reached");
  assert.equal(maxDurationReadiness.hasReachedMinEffectiveSample, false);

  const insufficientSampleReveal =
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: maxDurationProposition.id,
      now: "2026-04-18T10:08:00.000Z",
      updatedByUserId: "admin_1",
    });
  const maxDurationMarket = await harness.marketRepository.findByPropositionId(
    maxDurationProposition.id,
  );

  assert.equal(insufficientSampleReveal.officialResult.resultKind, "void");
  assert.equal(
    insufficientSampleReveal.officialResult.voidReason,
    "insufficient_sample",
  );
  assert.equal(insufficientSampleReveal.propositionStatus, "revealing");
  assert.equal(maxDurationMarket?.status, "frozen_for_reveal");
  assert.equal(maxDurationMarket?.lastPublicResult, null);

  const tieProposition = await createLiveProposition(harness, {
    minEffectiveSample: 2,
    minDurationSeconds: 60,
    maxDurationSeconds: 3600,
    marketEnabled: true,
  });
  const [tieTaskOne, tieTaskTwo] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: tieProposition.id,
      userIds: ["tie_user_1", "tie_user_2"],
      assignedAt: "2026-04-18T10:05:10.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
  const firstTieResponse = await harness.responseService.submitResponse({
    propositionId: tieProposition.id,
    taskId: tieTaskOne.id,
    userId: "tie_user_1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  const secondTieResponse = await harness.responseService.submitResponse({
    propositionId: tieProposition.id,
    taskId: tieTaskTwo.id,
    userId: "tie_user_2",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:05:21.000Z",
    clientSubmittedAt: "2026-04-18T10:05:41.000Z",
    submittedAt: "2026-04-18T10:05:41.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: firstTieResponse.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.responseReviewService.reviewValid({
    responseId: secondTieResponse.id,
    reviewedAt: "2026-04-18T10:05:51.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.counterService.rebuildCounterForProposition(tieProposition.id);

  const tieReveal =
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: tieProposition.id,
      now: "2026-04-18T10:06:00.000Z",
      updatedByUserId: "admin_1",
    });
  const tieStored = await harness.propositionRepository.findById(tieProposition.id);

  assert.equal(tieReveal.readiness.triggerReason, "min_duration_and_sample_reached");
  assert.equal(tieReveal.officialResult.resultKind, "void");
  assert.equal(tieReveal.officialResult.voidReason, "tie");
  assert.equal(tieStored?.status, "revealing");
  assert.equal(tieStored?.settledAt, null);
});

test("validation settlement rejects propositions that are not revealing", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });

  await assert.rejects(
    () =>
      harness.validationSettlementService.settleValidationMarket({
        propositionId: proposition.id,
        settledAt: "2026-04-18T10:07:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "validation_settlement.proposition_not_revealing",
  );
});

test("validation settlement rejects revealing propositions without official result", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });

  await harness.propositionService.freeze({
    propositionId: proposition.id,
    frozenAt: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.propositionService.startReveal({
    propositionId: proposition.id,
    revealStartedAt: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });

  await assert.rejects(
    () =>
      harness.validationSettlementService.settleValidationMarket({
        propositionId: proposition.id,
        settledAt: "2026-04-18T10:07:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "validation_settlement.official_result_missing",
  );
});

test("validation settlement settles market from proposition official result and marks proposition settled", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["settlement_response_user"],
    assignedAt: "2026-04-18T10:05:10.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "settlement_response_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "winner_bettor",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "loser_bettor",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });

  const pendingReward =
    await harness.rewardLedgerService.createPendingRewardForResponse({
      propositionId: proposition.id,
      responseId: response.id,
      userId: "settlement_response_user",
      createdAt: "2026-04-18T10:06:10.000Z",
    });

  const settlement =
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: proposition.id,
      settledAt: "2026-04-18T10:07:00.000Z",
      platformFeeBps: 0,
    });
  const snapshot = await harness.validationSettlementService.getSettlementSnapshot(
    proposition.id,
  );
  const settledProposition = await harness.propositionRepository.findById(
    proposition.id,
  );
  const settledMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  const currentPublicProgress = settledMarket?.currentPublicProgress as
    | Record<string, unknown>
    | null;
  const rewardAfterSettlement = harness.store.rewardLedgers.find(
    (ledger) => ledger.id === pendingReward.id,
  );

  assert.equal(settlement.officialResult.resultKind, "resolved");
  assert.equal(settlement.officialResult.winningOption, 0);
  assert.equal(snapshot.marketStatus, "settled");
  assert.equal(snapshot.propositionStatus, "settled");
  assert.equal(snapshot.settledBetCount, 2);
  assert.equal(settledMarket?.status, "settled");
  assert.equal(settledProposition?.status, "settled");
  assert.notEqual(settledMarket?.settledAt, null);
  assert.notEqual(settledProposition?.settledAt, null);
  assert.equal(harness.store.bets[0]?.settlementOutcome, "won");
  assert.equal(harness.store.bets[0]?.grossPayout, "30");
  assert.equal(harness.store.bets[0]?.pnl, "10");
  assert.equal(harness.store.bets[1]?.settlementOutcome, "lost");
  assert.equal(harness.store.bets[1]?.grossPayout, "0");
  assert.equal(harness.store.bets[1]?.pnl, "-10");
  assert.equal(rewardAfterSettlement?.status, "finalized");
  assert.equal(
    (currentPublicProgress?.lastPublishedResult as { winningOption?: number } | null)
      ?.winningOption,
    0,
  );
  assert.equal("option0Votes" in (currentPublicProgress ?? {}), false);
  assert.equal("option1Votes" in (currentPublicProgress ?? {}), false);
});

test("validation settlement refunds tie and void outcomes and repeated calls stay idempotent", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 2,
    marketEnabled: true,
  });
  const [taskOne, taskTwo] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["tie_settlement_user_1", "tie_settlement_user_2"],
      assignedAt: "2026-04-18T10:05:10.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const responseOne = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: taskOne.id,
    userId: "tie_settlement_user_1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  const responseTwo = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: taskTwo.id,
    userId: "tie_settlement_user_2",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:05:21.000Z",
    clientSubmittedAt: "2026-04-18T10:05:41.000Z",
    submittedAt: "2026-04-18T10:05:41.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: responseOne.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.responseReviewService.reviewValid({
    responseId: responseTwo.id,
    reviewedAt: "2026-04-18T10:05:51.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    reasonCodes: ["passes_quality_checks"],
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "tie_bettor_a",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "tie_bettor_b",
    selectedOption: 1,
    stakeAmount: "30",
    placedAt: "2026-04-18T10:05:46.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });

  const firstSettlement =
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: proposition.id,
      settledAt: "2026-04-18T10:07:00.000Z",
    });
  const secondSettlement =
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: proposition.id,
      settledAt: "2026-04-18T10:08:00.000Z",
    });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(firstSettlement.officialResult.resultKind, "void");
  assert.equal(firstSettlement.officialResult.voidReason, "tie");
  assert.equal(firstSettlement.isVoidSettlement, true);
  assert.equal(firstSettlement.isTieSettlement, true);
  assert.equal(secondSettlement.marketStatus, "settled");
  assert.equal(secondSettlement.propositionStatus, "settled");
  assert.equal(secondSettlement.settledBetCount, 2);
  assert.equal(harness.store.bets[0]?.settlementOutcome, "refund");
  assert.equal(harness.store.bets[0]?.grossPayout, "20");
  assert.equal(harness.store.bets[0]?.pnl, "0");
  assert.equal(harness.store.bets[0]?.refundAmount, "20");
  assert.equal(harness.store.bets[1]?.settlementOutcome, "refund");
  assert.equal(harness.store.bets[1]?.grossPayout, "30");
  assert.equal(harness.store.bets[1]?.pnl, "0");
  assert.equal(harness.store.bets[1]?.refundAmount, "30");
  assert.equal(settledMarket?.status, "settled");
  assert.equal(settledMarket?.settledAt?.toISOString(), "2026-04-18T10:07:00.000Z");
});

test("formal runtime happy path completes proposition -> dispatch -> review -> counter -> reveal -> settlement", async () => {
  const harness = createArenaHarness();

  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    minEffectiveSample: 1,
    marketEnabled: true,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });
  const live = await harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: live.id,
    userIds: ["formal_runtime_user"],
    assignedAt: "2026-04-18T10:05:10.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const started = await harness.dispatchEngineService.startTask({
    taskId: task.id,
    userId: "formal_runtime_user",
    startedAt: "2026-04-18T10:05:15.000Z",
  });
  const response = await harness.responseService.submitResponse({
    propositionId: live.id,
    taskId: task.id,
    userId: "formal_runtime_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:05:20.000Z",
    clientSubmittedAt: "2026-04-18T10:05:40.000Z",
    submittedAt: "2026-04-18T10:05:40.000Z",
    understandingAck: true,
  });
  const reviewed = await harness.qualityEngineService.reviewPendingResponse({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:05:50.000Z",
    reviewedByUserId: "reviewer_1",
  });
  const counter = await harness.counterService.rebuildCounterForProposition(live.id);
  const market = await harness.marketRepository.findByPropositionId(live.id);
  assert.ok(market);
  await harness.betService.placeBet({
    propositionId: live.id,
    marketId: market.id,
    userId: "formal_runtime_bettor",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  const reveal = await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: live.id,
    now: "2026-04-18T10:06:00.000Z",
    updatedByUserId: "admin_1",
  });
  const settlement = await harness.validationSettlementService.settleValidationMarket({
    propositionId: live.id,
    settledAt: "2026-04-18T10:07:00.000Z",
    platformFeeBps: 0,
  });
  const settlementSnapshot =
    await harness.validationSettlementService.getSettlementSnapshot(live.id);
  const storedTask = await harness.dispatchTaskRepository.findById(task.id);
  const storedReview = await harness.qualityEngineService.getReviewForResponse(
    response.id,
  );
  const storedProposition = await harness.propositionRepository.findById(live.id);
  const storedMarket = await harness.marketRepository.findByPropositionId(live.id);

  assert.equal(draft.status, "draft");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(live.status, "live");
  assert.equal(started.status, "started");
  assert.equal(storedTask?.status, "submitted");
  assert.equal(reviewed.status, "valid");
  assert.equal(storedReview?.reviewedByUserId, "reviewer_1");
  assert.equal(counter.effectiveSampleCount, 1);
  assert.equal(counter.hasReachedMinEffectiveSample, true);
  assert.equal(reveal.propositionStatus, "revealing");
  assert.equal(reveal.officialResult.resultKind, "resolved");
  assert.equal(reveal.officialResult.winningOption, 0);
  assert.equal(settlement.propositionStatus, "settled");
  assert.equal(settlement.marketStatus, "settled");
  assert.equal(settlement.settledBetCount, 1);
  assert.equal(settlementSnapshot.officialResult.winningOption, 0);
  assert.equal(storedProposition?.status, "settled");
  assert.equal(storedMarket?.status, "settled");
  assert.equal(harness.store.bets[0]?.settlementOutcome, "won");
  assert.equal(harness.store.rewardLedgers.length, 1);
});

test("maxDuration forced reveal can continue into void settlement and refund validation bets", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 3,
    minDurationSeconds: 120,
    maxDurationSeconds: 180,
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "max_duration_refund_bettor",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: "2026-04-18T10:05:30.000Z",
  });

  const reveal = await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:08:00.000Z",
    updatedByUserId: "admin_1",
  });
  const settlement = await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: "2026-04-18T10:08:30.000Z",
    platformFeeBps: 0,
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  const currentPublicProgress = settledMarket?.currentPublicProgress as
    | Record<string, unknown>
    | null;

  assert.equal(reveal.readiness.triggerReason, "max_duration_reached");
  assert.equal(reveal.officialResult.resultKind, "void");
  assert.equal(reveal.officialResult.voidReason, "insufficient_sample");
  assert.equal(settlement.isVoidSettlement, true);
  assert.equal(settlement.isTieSettlement, false);
  assert.equal(settlement.marketStatus, "settled");
  assert.equal(settlement.propositionStatus, "settled");
  assert.equal(harness.store.bets[0]?.settlementOutcome, "refund");
  assert.equal(harness.store.bets[0]?.grossPayout, "25");
  assert.equal(harness.store.bets[0]?.refundAmount, "25");
  assert.equal(harness.store.bets[0]?.pnl, "0");
  assert.equal(
    (currentPublicProgress?.lastPublishedResult as { voidReason?: string } | null)
      ?.voidReason,
    "insufficient_sample",
  );
  assert.equal("option0Votes" in (currentPublicProgress ?? {}), false);
  assert.equal("option1Votes" in (currentPublicProgress ?? {}), false);
});

test("getUserResponseForTask only allows the task owner", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["user_latest_only"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user_latest_only",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const ownerRead = await harness.responseService.getUserResponseForTask({
    taskId: task.id,
    userId: "user_latest_only",
  });
  assert.equal(ownerRead?.id, response.id);

  await assert.rejects(
    () =>
      harness.responseService.getUserResponseForTask({
        taskId: task.id,
        userId: "user_other",
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "dispatch_task.owner_mismatch",
  );
});

test("frozen proposition rejects further response submission", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const task = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "user_1",
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  await harness.propositionService.freeze({
    propositionId: proposition.id,
    frozenAt: "2026-04-18T10:08:00.000Z",
    updatedByUserId: "admin_1",
  });

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: task.id,
        userId: "user_1",
        selectedOption: 0,
        confirmationOption: 0,
        clientStartedAt: "2026-04-18T10:08:10.000Z",
        clientSubmittedAt: "2026-04-18T10:08:20.000Z",
        submittedAt: "2026-04-18T10:08:20.000Z",
        understandingAck: true,
      }),
    (error: unknown) => error instanceof ArenaValidationError,
  );
});

test("market live allows placing a bet and frozen market rejects new bets", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const bet = await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "bettor_1",
    selectedOption: 1,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:06:30.000Z",
  });

  assert.equal(bet.status, "placed");

  await harness.propositionService.freeze({
    propositionId: proposition.id,
    frozenAt: "2026-04-18T10:08:00.000Z",
    updatedByUserId: "admin_1",
  });

  await assert.rejects(
    () =>
      harness.betService.placeBet({
        propositionId: proposition.id,
        marketId: market.id,
        userId: "bettor_2",
        selectedOption: 0,
        stakeAmount: "20",
        placedAt: "2026-04-18T10:08:30.000Z",
      }),
    (error: unknown) => error instanceof ArenaValidationError,
  );
});

test("canonical closed loop runs aggregate -> official result -> settlement through one runtime entry", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
  });

  const task = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "user_1",
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user_1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const pendingReview = await harness.responseReviewRepository.findByResponseId(
    response.id,
  );
  assert.equal(pendingReview?.status, "pending_review");

  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });

  await harness.counterService.rebuildCounter(proposition.id);
  const progress = await harness.counterService.getPublicProgress(proposition.id);
  assert.equal(progress.progress.currentEffectiveSample, 1);
  assert.equal(progress.progress.reviewedCount, 1);

  const liveMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  assert.ok(liveMarket);

  const bet = await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "bettor_1",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:07:20.000Z",
  });

  assert.equal(bet.status, "placed");

  const frozenProposition = await harness.propositionService.freeze({
    propositionId: proposition.id,
    frozenAt: "2026-04-18T10:08:00.000Z",
    updatedByUserId: "admin_1",
  });
  const frozenMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );
  const revealingProposition = await harness.propositionService.startReveal({
    propositionId: proposition.id,
    revealStartedAt: "2026-04-18T10:08:30.000Z",
    updatedByUserId: "admin_1",
  });
  const closure = await harness.consensusClosureService.finalizeConsensusClosure({
    propositionId: proposition.id,
    resultComputedAt: "2026-04-18T10:08:40.000Z",
    settledAt: "2026-04-18T10:08:50.000Z",
    platformFeeBps: 0,
    updatedByUserId: "admin_1",
  });

  assert.equal(frozenProposition.status, "frozen");
  assert.equal(revealingProposition.status, "revealing");
  assert.equal(frozenMarket?.status, "frozen_for_reveal");
  assert.equal(closure.aggregate.resultKind, "resolved");
  assert.equal(closure.aggregate.winningOption, 0);
  assert.equal(closure.proposition.status, "settled");
  assert.equal(closure.proposition.resultKind, "resolved");
  assert.equal(closure.market?.status, "settled");
  assert.equal(harness.store.bets[0]?.settlementOutcome, "won");
  assert.equal(harness.store.bets[0]?.grossPayout, "20");
});

test("reward ledger progresses from pending to finalized and records a reversal when review is corrected", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const task = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "reward_user",
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });

  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "reward_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });

  const pendingLedger = await harness.rewardLedgerService.createPendingRewardForResponse({
    propositionId: proposition.id,
    responseId: response.id,
    userId: "reward_user",
    createdAt: "2026-04-18T10:07:10.000Z",
  });
  const finalizedLedger = await harness.rewardLedgerService.getByPropositionAndUser(
    proposition.id,
    "reward_user",
  );
  assert.equal(pendingLedger.status, "finalized");
  assert.equal(finalizedLedger?.status, "finalized");
  assert.equal(finalizedLedger?.finalAmount, "20");

  const correctedReview = await harness.responseReviewService.reviewInvalid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:40.000Z",
    reviewedByUserId: "reviewer_2",
    reasonCodes: ["integrity_violation"],
  });
  const currentLedger = await harness.rewardLedgerService.getByPropositionAndUser(
    proposition.id,
    "reward_user",
  );
  const ledgerHistory = await harness.rewardLedgerRepository.findByResponseId(
    response.id,
  );

  assert.equal(correctedReview.status, "invalid");
  assert.equal(currentLedger?.status, "voided");
  assert.equal(currentLedger?.reasonCode, "invalid_review");
  assert.equal(ledgerHistory.length, 2);
  assert.equal(ledgerHistory[0]?.status, "reversed");
  assert.equal(ledgerHistory[0]?.reasonCode, "review_corrected");
  assert.equal(ledgerHistory[1]?.status, "voided");
  assert.equal(ledgerHistory[1]?.reversalOfLedgerId, ledgerHistory[0]?.id ?? null);
});

test("requester budget ledger exposes reserved spent remaining released and adjusted budget truth", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Requester budget ledger truth proposition",
    createdByUserId: "creator_budget_truth",
    rewardBudget: "120",
    baseResponseReward: "20",
    marketEnabled: true,
    minEffectiveSample: 1,
  });
  const [validTask, partialTask, pendingTask, correctedTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: [
        "budget_valid_user",
        "budget_partial_user",
        "budget_pending_user",
        "budget_corrected_user",
      ],
      assignedAt: arenaTime(370),
      expiresAt: arenaTime(390),
    });
  assert.ok(validTask);
  assert.ok(partialTask);
  assert.ok(pendingTask);
  assert.ok(correctedTask);

  const validResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: validTask.id,
    userId: "budget_valid_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(370, 5),
    clientSubmittedAt: arenaTime(370, 10),
    understandingAck: true,
    submittedAt: arenaTime(370, 10),
  });
  await harness.responseReviewService.reviewValid({
    responseId: validResponse.id,
    reviewedAt: arenaTime(370, 20),
    reviewedByUserId: "reviewer_budget",
    reasonCodes: [...defaultReasonCodesByStatus.valid],
  });

  const partialResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: partialTask.id,
    userId: "budget_partial_user",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: arenaTime(371, 5),
    clientSubmittedAt: arenaTime(371, 10),
    understandingAck: true,
    submittedAt: arenaTime(371, 10),
  });
  await harness.responseReviewService.reviewPartialValid({
    responseId: partialResponse.id,
    reviewedAt: arenaTime(371, 20),
    reviewedByUserId: "reviewer_budget",
    reasonCodes: [...defaultReasonCodesByStatus.partial_valid],
  });

  await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: pendingTask.id,
    userId: "budget_pending_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(372, 5),
    clientSubmittedAt: arenaTime(372, 10),
    understandingAck: true,
    submittedAt: arenaTime(372, 10),
  });

  const correctedResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: correctedTask.id,
    userId: "budget_corrected_user",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: arenaTime(373, 5),
    clientSubmittedAt: arenaTime(373, 10),
    understandingAck: true,
    submittedAt: arenaTime(373, 10),
  });
  await harness.responseReviewService.reviewValid({
    responseId: correctedResponse.id,
    reviewedAt: arenaTime(373, 20),
    reviewedByUserId: "reviewer_budget",
    reasonCodes: [...defaultReasonCodesByStatus.valid],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: correctedResponse.id,
    reviewedAt: arenaTime(374, 20),
    reviewedByUserId: "reviewer_budget_correction",
    reasonCodes: [...defaultReasonCodesByStatus.invalid],
  });

  const detail = await harness.requesterPropositionViewService.getOwnedPropositionDetail({
    propositionId: proposition.id,
    userId: "creator_budget_truth",
  });
  const budgetLedger =
    await harness.requesterPropositionViewService.getOwnedPropositionBudgetLedger({
      propositionId: proposition.id,
      userId: "creator_budget_truth",
    });

  assert.equal(detail.budgetSummary.configuredAmount, "120");
  assert.equal(detail.budgetSummary.reservedAmount, "20");
  assert.equal(detail.budgetSummary.spentAmount, "30");
  assert.equal(detail.budgetSummary.remainingAmount, "70");
  assert.equal(detail.budgetSummary.releasedAmount, "30");
  assert.equal(detail.budgetSummary.adjustedAmount, "20");
  assert.equal(detail.budgetSummary.currentEntryCount, 4);
  assert.equal(detail.budgetSummary.pendingEntryCount, 1);
  assert.equal(detail.budgetSummary.finalizedEntryCount, 2);
  assert.equal(detail.budgetSummary.voidedEntryCount, 1);
  assert.equal(detail.budgetSummary.adjustedEntryCount, 1);

  assert.equal(budgetLedger.propositionId, proposition.id);
  assert.equal(budgetLedger.summary.remainingAmount, "70");
  assert.equal(budgetLedger.items.length, 5);
  const adjustedEntry = budgetLedger.items.find((item) => item.entryType === "adjusted");
  const releasedEntry = budgetLedger.items.find(
    (item) => item.entryType === "released" && item.releasedAmount === "20",
  );
  const reservedEntry = budgetLedger.items.find((item) => item.entryType === "reserved");
  const partialSpentEntry = budgetLedger.items.find(
    (item) => item.entryType === "spent" && item.spentAmount === "10",
  );
  const validSpentEntry = budgetLedger.items.find(
    (item) => item.entryType === "spent" && item.spentAmount === "20",
  );

  assert.ok(adjustedEntry);
  assert.equal(adjustedEntry.adjustedAmount, "20");
  assert.equal(adjustedEntry.reasonCode, "review_corrected");
  assert.ok(releasedEntry);
  assert.equal(releasedEntry.isCurrent, true);
  assert.ok(reservedEntry);
  assert.equal(reservedEntry.reservedAmount, "20");
  assert.equal(reservedEntry.isCurrent, true);
  assert.ok(partialSpentEntry);
  assert.equal(partialSpentEntry.releasedAmount, "10");
  assert.ok(validSpentEntry);
});

test("respondent reward endpoint only returns the current user's ledger view and strips internal fields", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [userOneTask, userTwoTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["reward_reader_1", "reward_reader_2"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

  const responseOne = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: userOneTask.id,
    userId: "reward_reader_1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  const responseTwo = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: userTwoTask.id,
    userId: "reward_reader_2",
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-18T10:06:30.000Z",
    clientSubmittedAt: "2026-04-18T10:06:40.000Z",
    submittedAt: "2026-04-18T10:06:40.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: responseOne.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: responseTwo.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["integrity_violation"],
  });

  const controller = new ArenaRespondentRewardsController(
    new RewardViewService(
      harness.propositionRepository as any,
      harness.rewardLedgerService as any,
    ),
  );

  const rewards = await controller.listRewards({
    user: { sub: "reward_reader_1" },
  } as any);

  assert.equal(rewards.length, 1);
  assert.equal(rewards[0]?.propositionId, proposition.id);
  assert.equal(rewards[0]?.status, "finalized");
  assert.equal(rewards[0]?.propositionTitle, proposition.title);
  assert.equal(rewards[0]?.isCurrent, true);
  assertInternalIdentityAbsentRecursively(rewards[0]);
  assert.equal("updatedAt" in (rewards[0] ?? {}), false);
});

test("public controller keeps live reads progress-only and adds published result after settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
  });
  const publicController = createPublicController(harness);

  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["controller_user"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "controller_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:30.000Z",
    submittedAt: "2026-04-18T10:06:30.000Z",
    understandingAck: true,
  });
  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });
  await harness.counterService.rebuildCounter(proposition.id);

  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const liveProgress = await publicController.getPropositionProgress(proposition.id);
  const liveMarket = await publicController.getMarket(market.id);

  assert.equal(liveProgress.progress.currentEffectiveSample, 1);
  assert.equal(liveProgress.lastPublishedResult, null);
  assert.equal("leadingOption" in liveProgress, false);
  assert.equal("currentRatio" in liveProgress, false);
  assert.equal("responseDistribution" in liveProgress, false);
  assert.equal("marketBias" in liveMarket, false);
  assert.equal("reviewOutcomeByOption" in liveMarket, false);
  assert.equal("reputationScore" in liveProgress, false);
  assert.equal("reputationLevel" in liveMarket, false);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "bettor_for_public_controller",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:07:10.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:07:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: "2026-04-18T10:08:00.000Z",
  });

  const settledProgress = await publicController.getPropositionProgress(proposition.id);
  const settledMarketView = await publicController.getMarket(market.id);

  assert.equal(settledProgress.lastPublishedResult?.winningOption, 0);
  assert.equal(settledMarketView.publicProgress.lastPublishedResult?.winningOption, 0);
});

test("public controller lists settled results for public verification without leaking pre-settlement state", async () => {
  const harness = createArenaHarness();
  const settledProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public settled verification proposition",
    category: "politics",
  });
  const liveProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Still live public proposition",
    category: "sports",
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    settledProposition.id,
  );
  assert.ok(settledMarket);

  await createReviewedResponseForProposition(harness, {
    propositionId: settledProposition.id,
    userId: "public_result_user_a",
    minuteOffset: 40,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: settledProposition.id,
    userId: "public_result_user_b",
    minuteOffset: 41,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: settledProposition.id,
    userId: "public_result_user_c",
    minuteOffset: 42,
    reviewStatus: "partial_valid",
  });
  await harness.counterService.rebuildCounterForProposition(settledProposition.id);

  await harness.betService.placeBet({
    propositionId: settledProposition.id,
    marketId: settledMarket.id,
    userId: "public_result_bettor",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: "2026-04-18T10:08:10.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledProposition.id,
    now: "2026-04-18T10:08:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(
    settledMarket.id,
    {
      resolutionTxHash: "0xsettledresult000000000000000000000000000000000000000000000000000001",
    },
  );
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: settledProposition.id,
    settledAt: "2026-04-18T10:09:00.000Z",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: liveProposition.id,
    userId: "public_result_live_user",
    minuteOffset: 43,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(liveProposition.id);

  const publicController = createPublicController(harness);

  const settledResults = await publicController.listSettledResults();

  assert.equal(settledResults.totalCount, 1);
  assert.equal(settledResults.items[0]?.propositionId, settledProposition.id);
  assert.equal(settledResults.items[0]?.title, "Public settled verification proposition");
  assert.equal(settledResults.items[0]?.category, "politics");
  assert.equal(settledResults.items[0]?.winningOption, 0);
  assert.equal(settledResults.items[0]?.winningOptionLabel, "A");
  assert.equal(settledResults.items[0]?.resultKind, "resolved");
  assert.equal(settledResults.items[0]?.validSampleCount, 3);
  assert.equal(settledResults.items[0]?.winMarginPercent, 100);
  assert.equal(
    settledResults.items[0]?.settlementTxHash,
    "0xsettledresult000000000000000000000000000000000000000000000000000001",
  );
  assert.equal(settledResults.items[0]?.onChain, true);
  assert.equal(
    settledResults.items.some((item) => item.propositionId === liveProposition.id),
    false,
  );
  assert.equal("option0Votes" in (settledResults.items[0] ?? {}), false);
  assert.equal("option1Votes" in (settledResults.items[0] ?? {}), false);
  assert.equal("reviewedResponses" in (settledResults.items[0] ?? {}), false);
});

test("public integrity overview aggregates live progress and settled archive without leaking operator-only fields", async () => {
  const harness = createArenaHarness();
  const collectingProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 3,
    title: "Public integrity collecting proposition",
    category: "ai",
  });
  const readyProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public integrity ready proposition",
    category: "politics",
  });
  const settledProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public integrity settled proposition",
    category: "sports",
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    settledProposition.id,
  );
  assert.ok(settledMarket);

  await createReviewedResponseForProposition(harness, {
    propositionId: collectingProposition.id,
    userId: "integrity_collecting_user",
    minuteOffset: 60,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: readyProposition.id,
    userId: "integrity_ready_user_a",
    minuteOffset: 61,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: readyProposition.id,
    userId: "integrity_ready_user_b",
    minuteOffset: 62,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: settledProposition.id,
    userId: "integrity_settled_user_a",
    minuteOffset: 63,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: settledProposition.id,
    userId: "integrity_settled_user_b",
    minuteOffset: 64,
    reviewStatus: "valid",
  });

  await harness.counterService.rebuildCounterForProposition(collectingProposition.id);
  await harness.counterService.rebuildCounterForProposition(readyProposition.id);
  await harness.counterService.rebuildCounterForProposition(settledProposition.id);

  await harness.betService.placeBet({
    propositionId: settledProposition.id,
    marketId: settledMarket.id,
    userId: "integrity_settled_bettor",
    selectedOption: 0,
    stakeAmount: "18",
    placedAt: "2026-04-18T11:11:00.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledProposition.id,
    now: "2026-04-18T11:11:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(settledMarket.id, {
    resolutionTxHash:
      "0xpublicintegrity0000000000000000000000000000000000000000000000000001",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: settledProposition.id,
    settledAt: "2026-04-18T11:12:00.000Z",
  });

  const publicController = createPublicController(harness);
  const overview = await publicController.getIntegrityOverview();

  assert.equal(typeof overview.generatedAt, "string");
  assert.equal(overview.live.totalCount, 2);
  assert.equal(overview.live.reachedSampleThresholdCount, 1);
  assert.equal(overview.live.marketEnabledCount, 2);
  assert.equal(
    overview.live.items.some(
      (item) =>
        item.propositionId === collectingProposition.id &&
        item.effectiveSampleCount === 1 &&
        item.requiredSampleCount === 3 &&
        item.reachedSampleThreshold === false &&
        item.category === "ai",
    ),
    true,
  );
  assert.equal(
    overview.live.items.some(
      (item) =>
        item.propositionId === readyProposition.id &&
        item.effectiveSampleCount === 2 &&
        item.requiredSampleCount === 2 &&
        item.reachedSampleThreshold === true &&
        item.category === "politics",
    ),
    true,
  );
  assert.equal(
    overview.live.phaseBreakdown.some(
      (bucket) => bucket.phase === "live" && bucket.count === 2,
    ),
    true,
  );
  assert.equal(overview.archive.settledCount, 1);
  assert.equal(overview.archive.onChainCount, 1);
  assert.equal(overview.archive.averageValidSampleCount, 2);
  assert.equal(
    overview.archive.latestSettledAt,
    "2026-04-18T11:12:00.000Z",
  );
  assert.equal(overview.archive.recentItems[0]?.propositionId, settledProposition.id);
  assert.equal(overview.archive.recentItems[0]?.settlementTxHash, "0xpublicintegrity0000000000000000000000000000000000000000000000000001");
  assert.equal(overview.focus, null);

  const focusedOverview = await publicController.getIntegrityOverview(
    settledProposition.id,
  );
  assert.equal(focusedOverview.focus?.propositionId, settledProposition.id);
  assert.equal(focusedOverview.focus?.visible, true);
  assert.equal(focusedOverview.focus?.source, "archive");
  assert.equal(
    focusedOverview.focus?.archiveItem?.propositionId,
    settledProposition.id,
  );
  assert.equal(focusedOverview.focus?.liveItem, null);

  const liveFocusedOverview = await publicController.getIntegrityOverview(
    collectingProposition.id,
  );
  assert.equal(liveFocusedOverview.focus?.propositionId, collectingProposition.id);
  assert.equal(liveFocusedOverview.focus?.visible, true);
  assert.equal(liveFocusedOverview.focus?.source, "live");
  assert.equal(
    liveFocusedOverview.focus?.liveItem?.propositionId,
    collectingProposition.id,
  );
  assert.equal(liveFocusedOverview.focus?.archiveItem, null);

  const missingFocusedOverview = await publicController.getIntegrityOverview(
    "missing-proposition",
  );
  assert.equal(missingFocusedOverview.focus?.propositionId, "missing-proposition");
  assert.equal(missingFocusedOverview.focus?.visible, false);
  assert.equal(missingFocusedOverview.focus?.source, null);
  assert.equal(missingFocusedOverview.focus?.liveItem, null);
  assert.equal(missingFocusedOverview.focus?.archiveItem, null);

  assert.equal("reviewedResponses" in (overview.live.items[0] ?? {}), false);
  assert.equal("flags" in (overview.live.items[0] ?? {}), false);
  assert.equal("resolutionTxHash" in (overview.live.items[0] ?? {}), false);
});

test("public controller searches public markets by title category and option labels without leaking private data", async () => {
  const harness = createArenaHarness();
  const policyProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Public transit support pulse",
    category: "politics",
    options: ["Support", "Oppose"],
  });
  const sportsProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Regional derby crowd energy",
    category: "sports",
    options: ["Loud", "Muted"],
  });
  const aiProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Model audit satisfaction",
    category: "ai",
    options: ["Satisfied", "Not satisfied"],
  });

  const publicController = createPublicController(harness);

  const titleMatches = await publicController.searchMarkets({ q: "transit" } as never);
  const optionMatches = await publicController.searchMarkets({ q: "satisfied" } as never);
  const categoryMatches = await publicController.searchMarkets({ q: "sports" } as never);
  const emptyQueryMatches = await publicController.searchMarkets({ q: "   " } as never);

  assert.deepEqual(
    titleMatches.map((market) => market.propositionId),
    [policyProposition.id],
  );
  assert.deepEqual(
    optionMatches.map((market) => market.propositionId),
    [aiProposition.id],
  );
  assert.deepEqual(
    categoryMatches.map((market) => market.propositionId),
    [sportsProposition.id],
  );
  assert.equal(emptyQueryMatches.length >= 3, true);
  assert.equal("marketBias" in (titleMatches[0] ?? {}), false);
  assert.equal("reviewOutcomeByOption" in (optionMatches[0] ?? {}), false);
});

test("public discovery controller serves home ranking latest topics and category directory from live market data", async () => {
  const harness = createArenaHarness();

  const politics = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Discovery politics proposition",
    category: "politics",
  });
  const sports = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Discovery sports proposition",
    category: "sports",
  });
  const ai = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 3,
    title: "Discovery ai proposition",
    category: "ai",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politics.id,
    userId: "discovery_politics_user",
    minuteOffset: 300,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: sports.id,
    userId: "discovery_sports_user",
    minuteOffset: 301,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: ai.id,
    userId: "discovery_ai_user",
    minuteOffset: 302,
    reviewStatus: "partial_valid",
  });

  await harness.counterService.rebuildCounterForProposition(politics.id);
  await harness.counterService.rebuildCounterForProposition(sports.id);
  await harness.counterService.rebuildCounterForProposition(ai.id);

  const discoveryController = new ArenaPublicDiscoveryController(
    new PublicDiscoveryService(
      new ValidationViewService(
        harness.config as any,
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
  );

  const home = await discoveryController.getHome();
  const hot = await discoveryController.getRanking("hot");
  const latest = await discoveryController.getLatestTopics();
  const categoryIndex = await discoveryController.getCategoryDirectoryIndex();
  const politicsDirectory = await discoveryController.getCategoryDirectory("politics");

  assert.equal(home.featuredMarketIds.length >= 1, true);
  assert.equal(home.sections.some((section) => section.href === "/zh"), true);
  assert.equal(home.sections.some((section) => section.href === "/zh/breaking"), true);
  assert.equal(hot.items.length >= 3, true);
  assert.equal(hot.items.some((item) => item.title === "Discovery sports proposition"), true);
  assert.equal("marketBias" in (hot.items[0] ?? {}), false);
  assert.equal(latest.items.length >= 3, true);
  assert.equal(latest.items.some((item) => item.id === "latest"), true);
  assert.equal(
    categoryIndex.items.some(
      (item) =>
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
    categoryIndex.items.some(
      (item) =>
        item.slug === "sports-live" &&
        item.pathname === "/zh/sports/live" &&
        item.label === "体育" &&
        item.directoryLabel === "体育结果",
    ),
    true,
  );
  assert.equal(politicsDirectory?.title, "政治");
  assert.equal(
    politicsDirectory?.marketIds.includes(
      (
        await harness.marketRepository.findByPropositionId(politics.id)
      )!.id,
    ),
    true,
  );
});

test("public discovery merges persisted discovery-config overrides into public outputs", async () => {
  const harness = createArenaHarness();

  const politics = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Config politics proposition",
    category: "politics",
  });
  const sports = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Config sports proposition",
    category: "sports",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politics.id,
    userId: "config_politics_user",
    minuteOffset: 330,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: sports.id,
    userId: "config_sports_user",
    minuteOffset: 331,
    reviewStatus: "valid",
  });

  await harness.counterService.rebuildCounterForProposition(politics.id);
  await harness.counterService.rebuildCounterForProposition(sports.id);

  const validationViews = new ValidationViewService(
    harness.config as any,
    harness.propositionRepository as any,
    harness.counterRepository as any,
    harness.marketRepository as any,
    harness.betRepository as any,
  );
  const discoveryConfig = new DiscoveryConfigService(
    new ArenaIdService(),
    harness.systemKeyValueRepository as any,
    validationViews,
  );

  const politicsMarket = (
    await harness.marketRepository.findByPropositionId(politics.id)
  )!;
  const sportsMarket = (
    await harness.marketRepository.findByPropositionId(sports.id)
  )!;


  await discoveryConfig.updateGlobalConfig({
    categories: [
      {
        slug: "sports-live",
        label: "竞技快讯",
        title: "竞技",
        directoryLabel: "竞技结果",
        description: "赛事结果与竞技热度",
        displayOrder: -10,
      },
      {
        slug: "politics",
        label: "政策雷达",
        title: "政策",
        directoryLabel: "政策目录",
        description: "政策议题与公共治理追踪",
        displayOrder: -9,
      },
      {
        slug: "crypto",
        title: "加密",
        description: "区块链与数字资产市场",
        displayOrder: -8,
        pageState: "hidden",
      },
      {
        slug: "finance",
        title: "金融",
        description: "资产价格与宏观经济",
        displayOrder: -7,
        pageState: "deleted",
      },
    ],
    rankingCategoryLabels: {
      all: "全部赛道",
      general: "综合",
      dao: "DAO",
      politics: "政策",
      sports: "竞技",
      tech: "科技",
      research: "研究",
      culture: "文化",
    },
  });

  const configuredPolitics = await discoveryConfig.updateCategoryConfig(
    "politics",
    {
      sidebarItems: [
        {
          id: "policy-focus",
          label: "政策焦点",
          linkedMarketIds: [
            politicsMarket.id,
            politicsMarket.id,
            "missing_market",
          ],
        },
        {
          id: "cross-category",
          label: "跨类绑定",
          linkedMarketIds: [sportsMarket.id],
        },
      ],
    },
  );

  assert.deepEqual(
    configuredPolitics.sidebarItems.map((item) => ({
      id: item.id,
      resolvedLinkedMarketCount: item.resolvedLinkedMarketCount,
      invalidLinkedMarketIds: item.invalidLinkedMarketIds,
    })),
    [
      {
        id: "policy-focus",
        resolvedLinkedMarketCount: 1,
        invalidLinkedMarketIds: ["missing_market"],
      },
      {
        id: "cross-category",
        resolvedLinkedMarketCount: 0,
        invalidLinkedMarketIds: [sportsMarket.id],
      },
    ],
  );

  const discoveryService = new PublicDiscoveryService(
    validationViews,
    discoveryConfig,
  );

  const home = await discoveryService.getHome();
  const hot = await discoveryService.getRanking("hot");
  const categoryIndex = await discoveryService.getCategoryDirectoryIndex();
  const politicsDirectory = await discoveryService.getCategoryDirectory(
    "/zh/politics",
  );
  const cryptoDirectory = await discoveryService.getCategoryDirectory(
    "/zh/crypto",
  );
  const financeDirectory = await discoveryService.getCategoryDirectory(
    "/zh/finance",
  );

  const sportsIndex = categoryIndex.items.findIndex(
    (item) => item.slug === "sports-live",
  );
  const politicsIndex = categoryIndex.items.findIndex(
    (item) => item.slug === "politics",
  );

  assert.equal(sportsIndex >= 0, true);
  assert.equal(politicsIndex >= 0, true);
  assert.equal(sportsIndex < politicsIndex, true);
  assert.equal(
    categoryIndex.items.find((item) => item.slug === "politics")?.label,
    "政策雷达",
  );
  assert.equal(
    categoryIndex.items.find((item) => item.slug === "politics")
      ?.description,
    "政策议题与公共治理追踪",
  );
  assert.equal(
    categoryIndex.items.some((item) => item.slug === "crypto"),
    false,
  );
  assert.equal(
    categoryIndex.items.some((item) => item.slug === "finance"),
    false,
  );
  assert.equal(
    home.sections.find((section) => section.href === "/zh/politics")?.label,
    "政策雷达",
  );
  assert.equal(
    home.sections.some((section) => section.href === "/zh/crypto"),
    false,
  );
  assert.equal(
    home.sections.some((section) => section.href === "/zh/finance"),
    false,
  );
  assert.equal(
    hot.categories.find((category) => category.id === "politics")?.label,
    "政策",
  );
  assert.equal(
    hot.items.some((item) => item.title === "Config sports proposition"),
    true,
  );
  assert.deepEqual(politicsDirectory?.sidebarItems, [
    {
      label: "政策焦点",
      count: "1",
      marketIds: [politicsMarket.id],
    },
    {
      label: "跨类绑定",
      count: "0",
      marketIds: [],
    },
  ]);
  assert.equal(cryptoDirectory, null);
  assert.equal(financeDirectory, null);
});

test("public discovery closing-soon buckets are ordered by nearest reveal window and exclude settled or expired markets", async () => {
  const harness = createArenaHarness();
  const now = new Date();
  const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const createRecentLiveProposition = async (input: {
    title: string;
    category: "politics" | "sports" | "ai" | "general";
    minDurationSeconds: number;
    maxDurationSeconds: number;
    liveOffsetMs: number;
  }) => {
    const draft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
      title: input.title,
      category: input.category,
      marketEnabled: true,
      minDurationSeconds: input.minDurationSeconds,
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

  const urgent = await createRecentLiveProposition({
    title: "Closing soon urgent proposition",
    category: "politics",
    minDurationSeconds: 300,
    maxDurationSeconds: 2 * 60 * 60,
    liveOffsetMs: -30 * 60 * 1000,
  });
  const upcoming = await createRecentLiveProposition({
    title: "Closing soon upcoming proposition",
    category: "ai",
    minDurationSeconds: 300,
    maxDurationSeconds: 8 * 60 * 60,
    liveOffsetMs: 0,
  });
  const laterUpcoming = await createRecentLiveProposition({
    title: "Closing soon later proposition",
    category: "sports",
    minDurationSeconds: 300,
    maxDurationSeconds: 14 * 60 * 60,
    liveOffsetMs: 0,
  });
  const expired = await createRecentLiveProposition({
    title: "Closing soon expired proposition",
    category: "general",
    minDurationSeconds: 300,
    maxDurationSeconds: 10 * 60,
    liveOffsetMs: -45 * 60 * 1000,
  });
  const settled = await createRecentLiveProposition({
    title: "Closing soon settled proposition",
    category: "politics",
    minDurationSeconds: 300,
    maxDurationSeconds: 90 * 60,
    liveOffsetMs: -20 * 60 * 1000,
  });

  await harness.propositionRepository.update(settled.id, {
    status: "settled",
    settledAt: new Date(now.getTime() - 5 * 60 * 1000),
    resultKind: "resolved",
    winningOption: 0,
    voidReason: null,
    resultComputedAt: new Date(now.getTime() - 6 * 60 * 1000),
  });

  const urgentMarket = await harness.marketRepository.findByPropositionId(urgent.id);
  const upcomingMarket = await harness.marketRepository.findByPropositionId(upcoming.id);
  const laterUpcomingMarket = await harness.marketRepository.findByPropositionId(laterUpcoming.id);
  const expiredMarket = await harness.marketRepository.findByPropositionId(expired.id);
  const settledMarket = await harness.marketRepository.findByPropositionId(settled.id);

  assert.ok(urgentMarket);
  assert.ok(upcomingMarket);
  assert.ok(laterUpcomingMarket);
  assert.ok(expiredMarket);
  assert.ok(settledMarket);

  const discoveryController = new ArenaPublicDiscoveryController(
    new PublicDiscoveryService(
      new ValidationViewService(
        harness.config as any,
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
  );

  const closingSoon = await discoveryController.getClosingSoon();

  assert.equal(closingSoon.urgentWindowMs, 3 * 60 * 60 * 1000);
  assert.deepEqual(closingSoon.urgent.map((item) => item.marketId), [urgentMarket.id]);
  assert.deepEqual(
    closingSoon.upcoming.map((item) => item.marketId),
    [upcomingMarket.id, laterUpcomingMarket.id],
  );
  assert.equal(closingSoon.urgent.every((item) => item.differenceMs > 0), true);
  assert.equal(
    closingSoon.upcoming.every((item) => item.differenceMs > closingSoon.urgentWindowMs),
    true,
  );
  assert.equal(
    closingSoon.upcoming[0]!.differenceMs <= closingSoon.upcoming[1]!.differenceMs,
    true,
  );
  assert.equal(
    closingSoon.urgent.some((item) => item.marketId === expiredMarket.id),
    false,
  );
  assert.equal(
    closingSoon.upcoming.some((item) => item.marketId === settledMarket.id),
    false,
  );
});

test("public respondent leaderboard only includes indexing-enabled public respondents and exposes masked aggregate rows", async () => {
  const harness = createArenaHarness();

  const politicsA = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public leaderboard politics A",
    category: "politics",
  });
  const politicsB = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public leaderboard politics B",
    category: "politics",
  });
  const aiA = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public leaderboard ai A",
    category: "ai",
  });
  const aiB = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Public leaderboard ai B",
    category: "ai",
  });

  const publicUser = "leaderboard_public_user";
  const memberOnlyUser = "0x2222222222222222222222222222222222222222";
  const notIndexedUser = "0x3333333333333333333333333333333333333333";

  await harness.userRepository.create({
    id: publicUser,
    primaryWalletAddress: "0x1111111111111111111111111111111111111111",
    normalizedPrimaryWalletAddress:
      "0x1111111111111111111111111111111111111111",
    status: "active",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politicsA.id,
    userId: publicUser,
    minuteOffset: 510,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: politicsB.id,
    userId: publicUser,
    minuteOffset: 511,
    reviewStatus: "partial_valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: aiA.id,
    userId: publicUser,
    minuteOffset: 512,
    reviewStatus: "valid",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politicsA.id,
    userId: memberOnlyUser,
    minuteOffset: 520,
    reviewStatus: "invalid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: aiB.id,
    userId: memberOnlyUser,
    minuteOffset: 521,
    reviewStatus: "valid",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politicsA.id,
    userId: notIndexedUser,
    minuteOffset: 530,
    reviewStatus: "valid",
  });

  const publicDefaults = await harness.accountPreferencesService.getAccountPreferencesForUser(publicUser);
  await harness.accountPreferencesService.updateAccountPreferencesForUser(publicUser, {
    ...publicDefaults,
    profile: {
      ...publicDefaults.profile,
      profileVisibility: "public",
    },
    privacy: {
      ...publicDefaults.privacy,
      allowActivityIndexing: true,
    },
  });

  const memberDefaults = await harness.accountPreferencesService.getAccountPreferencesForUser(memberOnlyUser);
  await harness.accountPreferencesService.updateAccountPreferencesForUser(memberOnlyUser, {
    ...memberDefaults,
    profile: {
      ...memberDefaults.profile,
      profileVisibility: "members",
    },
    privacy: {
      ...memberDefaults.privacy,
      allowActivityIndexing: true,
    },
  });

  const notIndexedDefaults = await harness.accountPreferencesService.getAccountPreferencesForUser(notIndexedUser);
  await harness.accountPreferencesService.updateAccountPreferencesForUser(notIndexedUser, {
    ...notIndexedDefaults,
    profile: {
      ...notIndexedDefaults.profile,
      profileVisibility: "public",
    },
    privacy: {
      ...notIndexedDefaults.privacy,
      allowActivityIndexing: false,
    },
  });

  const service = new PublicRespondentLeaderboardService(
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

  const leaderboard = await service.getLeaderboard();
  const politicsCategory = leaderboard.categories.find((category) => category.id === "public-policy");
  const aiCategory = leaderboard.categories.find((category) => category.id === "ai-research");

  assert.ok(politicsCategory);
  assert.ok(aiCategory);
  assert.equal(politicsCategory!.rows.length, 1);
  assert.equal(aiCategory!.rows.length, 1);
  assertInternalIdentityAbsentRecursively(politicsCategory!.rows[0]!);
  assert.equal(politicsCategory!.rows[0]!.handle, "respondent-1111");
  assert.equal(politicsCategory!.rows[0]!.walletShort, "0x1111…1111");
  assert.equal(politicsCategory!.rows[0]!.reviewedCount, 2);
  assert.equal(politicsCategory!.rows[0]!.acceptedCount, 2);
  assert.equal(politicsCategory!.rows[0]!.responseRatePercent, 100);
  assert.equal(politicsCategory!.rows[0]!.topTag.length > 0, true);
  assertInternalIdentityAbsentRecursively(aiCategory!.rows[0]!);
});

test("reputation snapshot persists explainable metrics across valid partial invalid and fraud outcomes", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [validTask, partialTask, invalidTask, fraudTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: [
        "rep_valid",
        "rep_partial",
        "rep_invalid",
        "rep_fraud",
      ],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

  const validResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: validTask.id,
    userId: "rep_valid",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:30.000Z",
    submittedAt: "2026-04-18T10:06:30.000Z",
    understandingAck: true,
  });
  const partialResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: partialTask.id,
    userId: "rep_partial",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:30.000Z",
    submittedAt: "2026-04-18T10:06:30.000Z",
    understandingAck: true,
  });
  const invalidResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: invalidTask.id,
    userId: "rep_invalid",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:30.000Z",
    submittedAt: "2026-04-18T10:06:30.000Z",
    understandingAck: true,
  });
  const fraudResponse = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: fraudTask.id,
    userId: "rep_fraud",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:30.000Z",
    submittedAt: "2026-04-18T10:06:30.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: validResponse.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });
  await harness.responseReviewService.reviewPartialValid({
    responseId: partialResponse.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    qualityScore: 60,
    flags: ["confirmation_mismatch"],
    reasonCodes: ["confirmation_mismatch"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: invalidResponse.id,
    reviewedAt: "2026-04-18T10:07:20.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["integrity_violation"],
  });
  await harness.responseReviewService.reviewFraudSuspected({
    responseId: fraudResponse.id,
    reviewedAt: "2026-04-18T10:07:30.000Z",
    reviewedByUserId: "reviewer_1",
    flags: ["integrity_violation"],
    reasonCodes: ["integrity_violation"],
  });

  const validRep = await harness.reputationService.getInternalViewForUser("rep_valid");
  const partialRep =
    await harness.reputationService.getInternalViewForUser("rep_partial");
  const invalidRep =
    await harness.reputationService.getInternalViewForUser("rep_invalid");
  const fraudRep = await harness.reputationService.getInternalViewForUser("rep_fraud");

  assert.ok(validRep.reputationScore > partialRep.reputationScore);
  assert.ok(partialRep.reputationScore > invalidRep.reputationScore);
  assert.ok(invalidRep.reputationScore > fraudRep.reputationScore);
  assert.equal(validRep.metrics.validRate, 1);
  assert.equal(partialRep.metrics.partialValidRate, 1);
  assert.equal(invalidRep.metrics.invalidRate, 1);
  assert.equal(fraudRep.metrics.fraudFlagCount, 1);
  assert.equal(fraudRep.metrics.anomalyRate, 1);
  assert.equal(validRep.reputationLevel, "new");
  assert.ok(validRep.reputationScore < 70);
  assert.equal(harness.store.userReputations.length, 4);
  assert.equal(
    (harness.store.userReputations[0]?.metricsJson as { reviewedResponseCount?: number })
      ?.reviewedResponseCount,
    1,
  );
});

test("reputation refresh is idempotent for review replay and does not create duplicate snapshots", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["rep_replay"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "rep_replay",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  const reviewInput = {
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  };

  await harness.responseReviewService.reviewValid(reviewInput);
  const firstSummary =
    await harness.reputationService.getInternalViewForUser("rep_replay");
  await harness.responseReviewService.reviewValid(reviewInput);
  const secondSummary =
    await harness.reputationService.getInternalViewForUser("rep_replay");

  assert.equal(harness.store.userReputations.length, 1);
  assert.deepEqual(secondSummary.metrics, firstSummary.metrics);
  assert.equal(secondSummary.reputationScore, firstSummary.reputationScore);
});

test("corrected review recomputes respondent reputation from current final review state", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["rep_corrected"],
    assignedAt: "2026-04-18T10:06:00.000Z",
    expiresAt: "2026-04-18T10:16:00.000Z",
  });
  const response = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "rep_corrected",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });
  const beforeCorrection =
    await harness.reputationService.getInternalViewForUser("rep_corrected");

  await harness.responseReviewService.reviewInvalid({
    responseId: response.id,
    reviewedAt: "2026-04-18T10:07:30.000Z",
    reviewedByUserId: "reviewer_2",
    reasonCodes: ["integrity_violation"],
  });
  const afterCorrection =
    await harness.reputationService.getInternalViewForUser("rep_corrected");

  assert.equal(beforeCorrection.metrics.validRate, 1);
  assert.equal(afterCorrection.metrics.validRate, 0);
  assert.equal(afterCorrection.metrics.invalidRate, 1);
  assert.ok(afterCorrection.reputationScore < beforeCorrection.reputationScore);
  assert.equal(harness.store.userReputations.length, 1);
});

test("respondent reputation self view only returns the caller summary while internal view keeps audit fields", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const [userOneTask, userTwoTask] =
    await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: proposition.id,
      userIds: ["rep_reader_1", "rep_reader_2"],
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });

  const responseOne = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: userOneTask.id,
    userId: "rep_reader_1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:10.000Z",
    clientSubmittedAt: "2026-04-18T10:06:20.000Z",
    submittedAt: "2026-04-18T10:06:20.000Z",
    understandingAck: true,
  });
  const responseTwo = await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: userTwoTask.id,
    userId: "rep_reader_2",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-18T10:06:30.000Z",
    clientSubmittedAt: "2026-04-18T10:06:40.000Z",
    submittedAt: "2026-04-18T10:06:40.000Z",
    understandingAck: true,
  });

  await harness.responseReviewService.reviewValid({
    responseId: responseOne.id,
    reviewedAt: "2026-04-18T10:07:00.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["meets_quality_bar"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: responseTwo.id,
    reviewedAt: "2026-04-18T10:07:10.000Z",
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["integrity_violation"],
  });

  const selfController = new ArenaRespondentReputationController(
    harness.reputationService,
  );
  const internalController = new ArenaInternalReputationController(
    harness.reputationService,
  );

  const selfView = await selfController.getOwnReputation({
    user: { sub: "rep_reader_1" },
  } as any);
  const internalView =
    await internalController.getRespondentReputation("rep_reader_1");

  assertInternalIdentityAbsentRecursively(selfView);
  assert.equal(selfView.metrics.reviewedResponseCount, 1);
  assert.equal("ruleVersion" in selfView, false);
  assert.equal("validCount" in selfView.metrics, false);
  assert.equal(internalView.userId, "rep_reader_1");
  assert.equal(internalView.ruleVersion, "quality-reputation-v1");
  assert.equal(internalView.metrics.validCount, 1);
});

test("reputation refresh maps into explainable quality tags and persists current rows", async () => {
  const harness = createArenaHarness();

  for (let index = 0; index < 5; index += 1) {
    await createReviewedResponse(harness, {
      userId: "tag_quality_user",
      category: "general",
      minuteOffset: index,
      reviewStatus: "valid",
    });
  }

  const summary = await harness.tagService.getSummaryForUser("tag_quality_user");
  const currentKeys = summary.tags.map((tag) => tag.tagKey).sort();

  assert.deepEqual(currentKeys, [
    "high_completion",
    "high_quality",
    "low_anomaly",
  ]);
  assert.equal(
    harness.store.userTags.filter((tag) => tag.userId === "tag_quality_user").length,
    3,
  );
  assert.equal(
    harness.store.userTags.every((tag) => tag.expiresAt === null),
    true,
  );
});

test("participation category changes recompute interest tags and expire stale tags", async () => {
  const harness = createArenaHarness();

  for (let index = 0; index < 3; index += 1) {
    await createSubmittedResponse(harness, {
      userId: "tag_interest_user",
      category: "sports",
      minuteOffset: index,
    });
  }

  const initialSummary =
    await harness.tagService.getSummaryForUser("tag_interest_user");
  assert.deepEqual(
    initialSummary.tags
      .filter((tag) => tag.tagType === "interest")
      .map((tag) => tag.tagKey),
    ["interested_in_sports"],
  );

  for (let index = 3; index < 8; index += 1) {
    await createSubmittedResponse(harness, {
      userId: "tag_interest_user",
      category: "ai",
      minuteOffset: index,
    });
  }

  const internalView =
    await harness.tagService.getInternalViewForUser("tag_interest_user");
  const aiTag = internalView.tags.find((tag) => tag.tagKey === "interested_in_ai");
  const sportsTag = internalView.tags.find(
    (tag) => tag.tagKey === "interested_in_sports",
  );
  const currentKeys = internalView.tags
    .filter((tag) => tag.expiresAt === null && tag.tagType === "interest")
    .map((tag) => tag.tagKey);

  assert.deepEqual(currentKeys, ["interested_in_ai"]);
  assert.equal(aiTag?.expiresAt, null);
  assert.ok(sportsTag);
  assert.notEqual(sportsTag?.expiresAt, null);
});

test("dao participation generates the dao interest tag", async () => {
  const harness = createArenaHarness();

  for (let index = 0; index < 4; index += 1) {
    await createSubmittedResponse(harness, {
      userId: "tag_dao_user",
      category: "dao",
      minuteOffset: index,
    });
  }

  const internalView = await harness.tagService.getInternalViewForUser("tag_dao_user");
  const currentKeys = internalView.tags
    .filter((tag) => tag.expiresAt === null && tag.tagType === "interest")
    .map((tag) => tag.tagKey);

  assert.deepEqual(currentKeys, ["interested_in_dao"]);
});

test("low-sample respondents do not receive aggressive quality or interest tags", async () => {
  const harness = createArenaHarness();

  await createReviewedResponse(harness, {
    userId: "tag_low_sample_user",
    category: "ai",
    minuteOffset: 0,
    reviewStatus: "valid",
  });

  const summary = await harness.tagService.getSummaryForUser("tag_low_sample_user");

  assert.equal(summary.tags.length, 0);
  assert.equal(
    harness.store.userTags.filter((tag) => tag.userId === "tag_low_sample_user").length,
    0,
  );
});

test("tag refresh is idempotent for replay and does not create duplicate current tags", async () => {
  const harness = createArenaHarness();
  let lastResponseId = "";

  for (let index = 0; index < 3; index += 1) {
    const created = await createReviewedResponse(harness, {
      userId: "tag_replay_user",
      category: "ai",
      minuteOffset: index,
      reviewStatus: "valid",
    });
    lastResponseId = created.response.id;
  }

  await harness.responseReviewService.reviewValid({
    responseId: lastResponseId,
    reviewedAt: arenaTime(2, 30),
    reviewedByUserId: "reviewer_1",
    reasonCodes: ["passes_quality_review"],
  });

  const currentTags = harness.store.userTags.filter(
    (tag) => tag.userId === "tag_replay_user" && tag.expiresAt === null,
  );

  assert.equal(currentTags.length, 2);
  assert.equal(
    harness.store.userTags.filter(
      (tag) => tag.userId === "tag_replay_user" && tag.tagKey === "high_completion",
    ).length,
    1,
  );
  assert.equal(
    harness.store.userTags.filter(
      (tag) => tag.userId === "tag_replay_user" && tag.tagKey === "interested_in_ai",
    ).length,
    1,
  );
});

test("corrected review recomputes quality tags and expires outdated mappings", async () => {
  const harness = createArenaHarness();
  const responseIds: string[] = [];

  for (let index = 0; index < 5; index += 1) {
    const created = await createReviewedResponse(harness, {
      userId: "tag_corrected_user",
      category: "general",
      minuteOffset: index,
      reviewStatus: "valid",
    });
    responseIds.push(created.response.id);
  }

  const beforeCorrection =
    await harness.tagService.getInternalViewForUser("tag_corrected_user");
  assert.equal(
    beforeCorrection.tags.some(
      (tag) => tag.tagKey === "high_quality" && tag.expiresAt === null,
    ),
    true,
  );

  await harness.responseReviewService.reviewInvalid({
    responseId: responseIds[0]!,
    reviewedAt: arenaTime(10, 0),
    reviewedByUserId: "reviewer_2",
    reasonCodes: ["integrity_violation"],
  });
  await harness.responseReviewService.reviewInvalid({
    responseId: responseIds[1]!,
    reviewedAt: arenaTime(11, 0),
    reviewedByUserId: "reviewer_2",
    reasonCodes: ["integrity_violation"],
  });

  const afterCorrection =
    await harness.tagService.getInternalViewForUser("tag_corrected_user");
  const currentKeys = afterCorrection.tags
    .filter((tag) => tag.expiresAt === null)
    .map((tag) => tag.tagKey)
    .sort();
  const expiredHighQuality = afterCorrection.tags.find(
    (tag) => tag.tagKey === "high_quality",
  );

  assert.deepEqual(currentKeys, [
    "high_completion",
    "low_anomaly",
    "risky_responder",
  ]);
  assert.ok(expiredHighQuality);
  assert.notEqual(expiredHighQuality?.expiresAt, null);
});

test("respondent tag self view only returns safe summary while internal view keeps audit fields", async () => {
  const harness = createArenaHarness();

  for (let index = 0; index < 3; index += 1) {
    await createSubmittedResponse(harness, {
      userId: "tag_reader_1",
      category: "ai",
      minuteOffset: index,
    });
  }
  for (let index = 3; index < 6; index += 1) {
    await createSubmittedResponse(harness, {
      userId: "tag_reader_2",
      category: "sports",
      minuteOffset: index,
    });
  }

  const selfController = new ArenaRespondentTagsController(harness.tagService);
  const internalController = new ArenaInternalTagsController(harness.tagService);

  const selfView = await selfController.getOwnTags({
    user: { sub: "tag_reader_1" },
  } as any);
  const internalView = await internalController.getRespondentTags("tag_reader_1");
  const selfTag = selfView.tags[0];
  const internalTag = internalView.tags.find(
    (tag) => tag.tagKey === "interested_in_ai",
  );

  assertInternalIdentityAbsentRecursively(selfView);
  assert.deepEqual(
    selfView.tags
      .filter((tag) => tag.tagType === "interest")
      .map((tag) => tag.tagKey),
    ["interested_in_ai"],
  );
  assert.equal("sourceType" in (selfTag ?? {}), false);
  assert.equal("ruleVersion" in (selfTag ?? {}), false);
  assert.equal("metadata" in (selfTag ?? {}), false);
  assert.ok(internalTag);
  assert.equal(internalTag?.sourceType, "participation");
  assert.equal(internalTag?.ruleVersion, "respondent-tags-v1");
  assert.equal(typeof internalTag?.metadata, "object");
});

test("dispatch excludes explicitly risky respondents while keeping safe candidates eligible", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_risky_user",
    category: "general",
    count: 1,
    startMinuteOffset: 0,
    reviewStatus: "fraud_suspected",
    flags: ["suspicious_latency"],
  });

  const proposition = await createLiveProposition(harness, {
    category: "general",
  });
  const previewController = new ArenaInternalDispatchController(
    harness.dispatchEngineService,
  );
  const preview = await previewController.previewDispatch(proposition.id, {
    userIds: ["dispatch_risky_user", "dispatch_safe_user"],
    assignedAt: arenaTime(20),
    maxAssignments: 2,
  } as any);
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_risky_user", "dispatch_safe_user"],
    assignedAt: arenaTime(20),
    expiresAt: arenaTime(30),
    maxAssignments: 2,
  });

  assert.deepEqual(created.map((task) => task.userId), ["dispatch_safe_user"]);
  assert.equal(
    preview.candidates.find((candidate) => candidate.userId === "dispatch_risky_user")
      ?.blockReason,
    "risky_reputation_guard",
  );
});

test("dispatch enforces sample constraints using wallet binding history and active tags", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_experienced_wallet_tagged",
    category: "sports",
    count: 3,
    startMinuteOffset: 0,
    reviewStatus: "valid",
  });

  await harness.userRepository.updatePrimaryWalletAddress(
    "dispatch_experienced_wallet_tagged",
    "0x00000000000000000000000000000000000000c1",
  );
  await harness.userTagRepository.upsertByUserIdAndTagKey(
    "dispatch_experienced_wallet_tagged",
    "interested_in_sports",
    {
      id: "user_tag_dispatch_interested_in_sports",
      userId: "dispatch_experienced_wallet_tagged",
      tagKey: "interested_in_sports",
      tagType: "interest",
      tagValue: "active",
      confidenceScore: 100,
      sourceType: "participation",
      ruleVersion: "respondent-tags-v1",
      metadataJson: {},
      activatedAt: new Date(arenaTime(15)),
      expiresAt: null,
    },
    {
      expiresAt: null,
      confidenceScore: 100,
      updatedAt: new Date(arenaTime(15)),
    },
  );

  await createReviewedHistory(harness, {
    userId: "dispatch_wallet_missing",
    category: "sports",
    count: 3,
    startMinuteOffset: 20,
    reviewStatus: "valid",
  });
  await harness.userTagRepository.upsertByUserIdAndTagKey(
    "dispatch_wallet_missing",
    "interested_in_sports",
    {
      id: "user_tag_dispatch_wallet_missing_interested_in_sports",
      userId: "dispatch_wallet_missing",
      tagKey: "interested_in_sports",
      tagType: "interest",
      tagValue: "active",
      confidenceScore: 100,
      sourceType: "participation",
      ruleVersion: "respondent-tags-v1",
      metadataJson: {},
      activatedAt: new Date(arenaTime(35)),
      expiresAt: null,
    },
    {
      expiresAt: null,
      confidenceScore: 100,
      updatedAt: new Date(arenaTime(35)),
    },
  );

  await harness.userRepository.create({
    id: "dispatch_tag_missing",
    primaryWalletAddress: "0x00000000000000000000000000000000000000c2",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000c2",
    status: "active",
  });
  await createReviewedHistory(harness, {
    userId: "dispatch_tag_missing",
    category: "general",
    count: 3,
    startMinuteOffset: 40,
    reviewStatus: "valid",
  });

  const proposition = await createLiveProposition(harness, {
    category: "general",
    sampleConstraints: [
      "experienced_user",
      "wallet_signed",
      "interested_in_sports",
    ],
  });
  const preview = await harness.dispatchEngineService.previewDispatchCandidates({
    propositionId: proposition.id,
    userIds: [
      "dispatch_experienced_wallet_tagged",
      "dispatch_wallet_missing",
      "dispatch_tag_missing",
    ],
    assignedAt: arenaTime(60),
    maxAssignments: 3,
  });
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: [
      "dispatch_experienced_wallet_tagged",
      "dispatch_wallet_missing",
      "dispatch_tag_missing",
    ],
    assignedAt: arenaTime(60),
    expiresAt: arenaTime(70),
    maxAssignments: 3,
  });

  assert.deepEqual(created.map((task) => task.userId), [
    "dispatch_experienced_wallet_tagged",
  ]);
  assert.equal(preview.selectedUserIds[0], "dispatch_experienced_wallet_tagged");
  assert.equal(
    preview.candidates.find(
      (candidate) => candidate.userId === "dispatch_wallet_missing",
    )?.blockReason,
    "sample_constraints_mismatch",
  );
  assert.equal(
    preview.candidates.find(
      (candidate) => candidate.userId === "dispatch_tag_missing",
    )?.blockReason,
    "sample_constraints_mismatch",
  );
});

test("dispatch softly prioritizes high-quality stable respondents when slots are limited", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_stable_user",
    category: "general",
    count: 8,
    startMinuteOffset: 0,
    reviewStatus: "valid",
  });

  const proposition = await createLiveProposition(harness, {
    category: "general",
  });
  const preview = await harness.dispatchEngineService.previewDispatchCandidates({
    propositionId: proposition.id,
    userIds: ["dispatch_new_user", "dispatch_stable_user"],
    assignedAt: arenaTime(30),
    maxAssignments: 1,
  });
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_new_user", "dispatch_stable_user"],
    assignedAt: arenaTime(30),
    expiresAt: arenaTime(40),
    maxAssignments: 1,
  });

  assert.deepEqual(created.map((task) => task.userId), ["dispatch_stable_user"]);
  assert.equal(preview.selectedUserIds[0], "dispatch_stable_user");
  assert.equal(
    preview.candidates.find((candidate) => candidate.userId === "dispatch_stable_user")
      ?.priorityBucket,
    "priority",
  );
});

test("interest-matched respondents are preferred but cannot monopolize limited dispatch slots", async () => {
  const harness = createArenaHarness();

  await createParticipationHistory(harness, {
    userId: "dispatch_ai_user_1",
    category: "ai",
    count: 3,
    startMinuteOffset: 0,
  });
  await createParticipationHistory(harness, {
    userId: "dispatch_ai_user_2",
    category: "ai",
    count: 3,
    startMinuteOffset: 10,
  });

  const proposition = await createLiveProposition(harness, {
    category: "ai",
  });
  const preview = await harness.dispatchEngineService.previewDispatchCandidates({
    propositionId: proposition.id,
    userIds: [
      "dispatch_ai_user_1",
      "dispatch_ai_user_2",
      "dispatch_general_user_1",
      "dispatch_general_user_2",
    ],
    assignedAt: arenaTime(50),
    maxAssignments: 3,
  });
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: [
      "dispatch_ai_user_1",
      "dispatch_ai_user_2",
      "dispatch_general_user_1",
      "dispatch_general_user_2",
    ],
    assignedAt: arenaTime(50),
    expiresAt: arenaTime(60),
    maxAssignments: 3,
  });
  const selectedUsers = created.map((task) => task.userId);

  assert.equal(preview.generalReserveCount, 1);
  assert.equal(
    selectedUsers.some((userId) => userId.startsWith("dispatch_ai_user_")),
    true,
  );
  assert.equal(
    selectedUsers.some((userId) => userId.startsWith("dispatch_general_user_")),
    true,
  );
});

test("new respondents still retain an entry path even when matched-interest users exist", async () => {
  const harness = createArenaHarness();

  await createParticipationHistory(harness, {
    userId: "dispatch_interest_user",
    category: "sports",
    count: 3,
    startMinuteOffset: 0,
  });

  const proposition = await createLiveProposition(harness, {
    category: "sports",
  });
  const preview = await harness.dispatchEngineService.previewDispatchCandidates({
    propositionId: proposition.id,
    userIds: ["dispatch_interest_user", "dispatch_new_a", "dispatch_new_b"],
    assignedAt: arenaTime(70),
    maxAssignments: 2,
  });
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_interest_user", "dispatch_new_a", "dispatch_new_b"],
    assignedAt: arenaTime(70),
    expiresAt: arenaTime(80),
    maxAssignments: 2,
  });
  const selectedUsers = created.map((task) => task.userId);

  assert.equal(preview.generalReserveCount, 1);
  assert.equal(selectedUsers.includes("dispatch_interest_user"), true);
  assert.equal(
    selectedUsers.some((userId) => userId.startsWith("dispatch_new_")),
    true,
  );
});

test("already-participated respondents are skipped instead of being redispatched", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    category: "general",
  });
  const [firstTask] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_repeat_user"],
    assignedAt: arenaTime(90),
    expiresAt: arenaTime(100),
  });

  await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: firstTask.id,
    userId: "dispatch_repeat_user",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(90, 10),
    clientSubmittedAt: arenaTime(90, 20),
    understandingAck: true,
    submittedAt: arenaTime(90, 20),
  });

  const preview = await harness.dispatchEngineService.previewDispatchCandidates({
    propositionId: proposition.id,
    userIds: ["dispatch_repeat_user", "dispatch_fresh_user"],
    assignedAt: arenaTime(101),
    maxAssignments: 2,
  });
  const created = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_repeat_user", "dispatch_fresh_user"],
    assignedAt: arenaTime(101),
    expiresAt: arenaTime(111),
    maxAssignments: 2,
  });

  assert.deepEqual(created.map((task) => task.userId), ["dispatch_fresh_user"]);
  assert.equal(
    preview.candidates.find((candidate) => candidate.userId === "dispatch_repeat_user")
      ?.blockReason,
    "existing_submitted_task",
  );
});

test("repeated dispatch does not create duplicate active tasks when tag-based scoring is enabled", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_duplicate_safe",
    category: "general",
    count: 5,
    startMinuteOffset: 0,
    reviewStatus: "valid",
  });

  const proposition = await createLiveProposition(harness, {
    category: "general",
  });
  const firstBatch = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_duplicate_safe"],
    assignedAt: arenaTime(120),
    expiresAt: arenaTime(130),
    maxAssignments: 1,
  });
  const secondBatch = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_duplicate_safe"],
    assignedAt: arenaTime(121),
    expiresAt: arenaTime(131),
    maxAssignments: 1,
  });

  assert.equal(firstBatch.length, 1);
  assert.deepEqual(secondBatch, []);
  assert.equal(
    harness.store.dispatchTasks.filter(
      (task) =>
        task.propositionId === proposition.id &&
        task.userId === "dispatch_duplicate_safe",
    ).length,
    1,
  );
});

test("internal dispatch preview explains why candidates are boosted, reserved, or blocked", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_preview_quality",
    category: "general",
    count: 5,
    startMinuteOffset: 0,
    reviewStatus: "valid",
  });
  await createParticipationHistory(harness, {
    userId: "dispatch_preview_interest",
    category: "ai",
    count: 3,
    startMinuteOffset: 10,
  });

  const proposition = await createLiveProposition(harness, {
    category: "ai",
  });
  const controller = new ArenaInternalDispatchController(
    harness.dispatchEngineService,
  );
  const preview = await controller.previewDispatch(proposition.id, {
    userIds: [
      "dispatch_preview_quality",
      "dispatch_preview_interest",
      "dispatch_preview_new",
    ],
    assignedAt: arenaTime(140),
    maxAssignments: 2,
  } as any);
  const interestCandidate = preview.candidates.find(
    (candidate) => candidate.userId === "dispatch_preview_interest",
  );
  const newCandidate = preview.candidates.find(
    (candidate) => candidate.userId === "dispatch_preview_new",
  );

  assert.equal(preview.propositionId, proposition.id);
  assert.equal(preview.ruleVersion, "dispatch-tags-v1");
  assert.equal(preview.selectedUserIds.length, 2);
  assert.equal(
    interestCandidate?.reasons.includes("boost_interest_match:interested_in_ai"),
    true,
  );
  assert.equal(
    newCandidate?.reasons.includes("retain_low_sample_entry"),
    true,
  );
});

test("respondent and public reads do not expose dispatch scoring internals", async () => {
  const harness = createArenaHarness();

  await createReviewedHistory(harness, {
    userId: "dispatch_surface_user",
    category: "general",
    count: 5,
    startMinuteOffset: 0,
    reviewStatus: "valid",
  });

  const proposition = await createLiveProposition(harness, {
    category: "general",
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["dispatch_surface_user"],
    assignedAt: arenaTime(150),
    expiresAt: arenaTime(160),
    maxAssignments: 1,
  });

  const taskView = await new AdjudicationViewService(
    harness.propositionRepository as any,
    harness.dispatchTaskRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
    harness.rewardLedgerRepository as any,
  ).getTaskForUser(task.id, "dispatch_surface_user");

  assert.equal("finalScore" in taskView, false);
  assert.equal("qualityAdjustment" in taskView, false);
  assert.equal("interestAdjustment" in taskView, false);
  assert.equal("reasons" in taskView, false);
  assert.equal("blockReason" in taskView, false);
});

test("internal proposition control supports approve reject freeze with audit reasons", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );

  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Approve me",
    createdByUserId: "creator_approve",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: draft.id,
    userId: "creator_approve",
    note: "approve_queue",
  });
  const approved = await controller.approveProposition(
    draft.id,
    {
      publishedAt: "2026-04-18T10:00:00.000Z",
      reason: "passed_internal_review",
      note: "ready_for_schedule",
    } as any,
    { user: { sub: "operator_1" } } as any,
  );

  const rejectDraft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Reject me",
    createdByUserId: "creator_reject",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: rejectDraft.id,
    userId: "creator_reject",
    note: "reject_queue",
  });
  const rejected = await controller.rejectProposition(
    rejectDraft.id,
    {
      rejectedAt: "2026-04-18T10:01:00.000Z",
      reason: "duplicate_scope",
      note: "superseded_by_existing_proposition",
    } as any,
    { user: { sub: "operator_1" } } as any,
  );

  const live = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Freeze me",
  });
  const frozen = await controller.emergencyFreeze(
    live.id,
    {
      frozenAt: "2026-04-18T10:15:00.000Z",
      reason: "operator_emergency",
      note: "unexpected_signal_detected",
    } as any,
    { user: { sub: "operator_2" } } as any,
  );

  assert.equal(approved.proposition.status, "scheduled");
  assert.equal(approved.submission.status, "approved");
  assert.equal(rejected.proposition.status, "archived");
  assert.equal(rejected.submission.status, "rejected");
  assert.equal(frozen.proposition.status, "frozen");
  assert.equal(frozen.market?.status, "frozen_for_reveal");
  assert.deepEqual(
    harness.store.internalAuditEvents.map((event) => event.action).sort(),
    [
      "proposition_approved",
      "proposition_emergency_frozen",
      "proposition_rejected",
      "proposition_submitted_for_review",
      "proposition_submitted_for_review",
    ],
  );
});

test("internal proposition approve and reject require submitted drafts", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );
  const unsubmittedDraft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Unsubmitted draft",
    createdByUserId: "creator_unsubmitted",
  });

  await assert.rejects(
    () =>
      controller.approveProposition(
        unsubmittedDraft.id,
        {
          publishedAt: "2026-04-18T10:00:00.000Z",
          reason: "should_fail",
        } as any,
        { user: { sub: "operator_1" } } as any,
      ),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.approve_requires_submission",
  );

  await assert.rejects(
    () =>
      controller.rejectProposition(
        unsubmittedDraft.id,
        {
          rejectedAt: "2026-04-18T10:01:00.000Z",
          reason: "should_fail",
        } as any,
        { user: { sub: "operator_1" } } as any,
      ),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "proposition.reject_requires_submission",
  );
});

test("scheduled propositions auto publish to live when their publishedAt has arrived", async () => {
  const harness = createArenaHarness();
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Auto publish me",
    marketEnabled: true,
    createdByUserId: "creator_auto_publish",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: draft.id,
    userId: "creator_auto_publish",
  });
  const scheduled = await harness.internalPropositionOpsService.approveProposition({
    propositionId: draft.id,
    actorUserId: "operator_auto_publish",
    publishedAt: "2026-04-18T10:00:00.000Z",
    reason: "ready_for_automation",
  });

  assert.equal(scheduled.proposition.status, "scheduled");

  const result =
    await harness.propositionLifecycleAutomationService.publishReadyScheduledPropositions({
      now: "2026-04-18T10:01:00.000Z",
    });

  const live = await harness.propositionRepository.findById(draft.id);
  const market = await harness.marketRepository.findByPropositionId(draft.id);

  assert.equal(result.processedCount, 1);
  assert.deepEqual(result.propositionIds, [draft.id]);
  assert.equal(live?.status, "live");
  assert.equal(live?.liveAt?.toISOString(), "2026-04-18T10:00:00.000Z");
  assert.equal(market?.status, "live");
  assert.equal(
    harness.store.internalAuditEvents.some(
      (event) =>
        event.entityId === draft.id &&
        event.action === "proposition_auto_published_live",
    ),
    true,
  );
});

test("scheduled propositions remain scheduled before publishedAt and do not auto publish early", async () => {
  const harness = createArenaHarness();
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Future publish",
    marketEnabled: false,
    createdByUserId: "creator_future_publish",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: draft.id,
    userId: "creator_future_publish",
  });
  await harness.internalPropositionOpsService.approveProposition({
    propositionId: draft.id,
    actorUserId: "operator_future_publish",
    publishedAt: "2026-04-18T10:30:00.000Z",
    reason: "scheduled_for_later",
  });

  const result =
    await harness.propositionLifecycleAutomationService.publishReadyScheduledPropositions({
      now: "2026-04-18T10:01:00.000Z",
    });

  const proposition = await harness.propositionRepository.findById(draft.id);

  assert.equal(result.processedCount, 0);
  assert.deepEqual(result.propositionIds, []);
  assert.equal(proposition?.status, "scheduled");
});

test("live propositions auto finalize reveal when freeze readiness is satisfied", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    minDurationSeconds: 60,
    maxDurationSeconds: 3600,
    marketEnabled: true,
    title: "Auto reveal ready",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "auto_reveal_user",
    minuteOffset: 0,
    reviewStatus: "valid",
  });

  const result =
    await harness.propositionLifecycleAutomationService.finalizeReadyLivePropositions({
      now: "2026-04-18T10:06:30.000Z",
    });

  const revealing = await harness.propositionRepository.findById(proposition.id);
  const market = await harness.marketRepository.findByPropositionId(proposition.id);

  assert.equal(result.processedCount, 1);
  assert.deepEqual(result.propositionIds, [proposition.id]);
  assert.equal(revealing?.status, "revealing");
  assert.equal(revealing?.resultKind, "resolved");
  assert.equal(revealing?.winningOption, 0);
  assert.equal(revealing?.frozenAt?.toISOString(), "2026-04-18T10:06:30.000Z");
  assert.equal(
    revealing?.revealStartedAt?.toISOString(),
    "2026-04-18T10:06:30.000Z",
  );
  assert.equal(market?.status, "frozen_for_reveal");
  assert.equal(
    harness.store.internalAuditEvents.some(
      (event) =>
        event.entityId === proposition.id &&
        event.action === "proposition_auto_prepared_reveal",
    ),
    true,
  );
});

test("revealing propositions auto settle when market is frozen_for_reveal", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Auto settle ready",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "auto_settle_response_user",
    minuteOffset: 0,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "auto_settle_bettor_a",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "auto_settle_bettor_b",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });

  const result =
    await harness.propositionLifecycleAutomationService.settleReadyRevealingPropositions(
      {
        now: "2026-04-18T10:07:00.000Z",
      },
    );

  const settled = await harness.propositionRepository.findById(proposition.id);
  const settledMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(result.processedCount, 1);
  assert.deepEqual(result.propositionIds, [proposition.id]);
  assert.equal(settled?.status, "settled");
  assert.equal(settled?.settledAt?.toISOString(), "2026-04-18T10:07:00.000Z");
  assert.equal(settledMarket?.status, "settled");
  assert.equal(
    harness.store.internalAuditEvents.some(
      (event) =>
        event.entityId === proposition.id &&
        event.action === "proposition_auto_settled",
    ),
    true,
  );
});

test("revealing propositions wait for projected chain resolution before auto settlement when validation runtime is enabled", async () => {
  const validationChainRuntime = createValidationChainRuntimeRecorder();
  const harness = createArenaHarness({
    validationChainRuntime: validationChainRuntime as any,
  });
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Chain gated settlement",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "chain_gate_response_user",
    minuteOffset: 0,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "chain_gate_bettor_a",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "chain_gate_bettor_b",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });

  const result =
    await harness.propositionLifecycleAutomationService.settleReadyRevealingPropositions(
      {
        now: "2026-04-18T10:07:00.000Z",
      },
    );

  const revealing = await harness.propositionRepository.findById(proposition.id);
  const frozenMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(validationChainRuntime.createOpenCalls.length, 1);
  assert.equal(validationChainRuntime.freezeCalls.length, 1);
  assert.equal(validationChainRuntime.resolveCalls.length, 1);
  assert.equal(result.processedCount, 0);
  assert.deepEqual(result.propositionIds, []);
  assert.equal(revealing?.status, "revealing");
  assert.equal(frozenMarket?.status, "frozen_for_reveal");
});

test("revealing propositions auto settle after projected chain resolution when validation runtime is enabled", async () => {
  const validationChainRuntime = createValidationChainRuntimeRecorder();
  const harness = createArenaHarness({
    validationChainRuntime: validationChainRuntime as any,
  });
  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Chain resolved settlement",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "chain_resolved_response_user",
    minuteOffset: 0,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "chain_resolved_bettor_a",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "chain_resolved_bettor_b",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(market.id, {
    chainStatus: "resolved",
    chainResolvedAt: new Date("2026-04-18T10:06:50.000Z"),
    chainResultKind: "resolved",
    chainWinningOption: 0,
    resolutionTxHash: `0x${"1".repeat(64)}`,
  });

  const result =
    await harness.propositionLifecycleAutomationService.settleReadyRevealingPropositions(
      {
        now: "2026-04-18T10:07:00.000Z",
      },
    );

  const settled = await harness.propositionRepository.findById(proposition.id);
  const settledMarket = await harness.marketRepository.findByPropositionId(
    proposition.id,
  );

  assert.equal(validationChainRuntime.freezeCalls.length, 1);
  assert.equal(validationChainRuntime.resolveCalls.length, 1);
  assert.equal(result.processedCount, 1);
  assert.deepEqual(result.propositionIds, [proposition.id]);
  assert.equal(settled?.status, "settled");
  assert.equal(settledMarket?.status, "settled");
  const propositionDetail =
    await harness.internalPropositionOpsService.getPropositionDetail(
      proposition.id,
    );

  assert.equal(
    propositionDetail.validationRehearsalCheckpoints.some(
      (checkpoint) =>
        checkpoint.stepId === "projection_and_settlement" &&
        checkpoint.reason ===
          "validation_rehearsal.auto.local_settlement_converged" &&
        checkpoint.status === "complete",
    ),
    true,
  );
  assert.equal(
    propositionDetail.validationRehearsal.steps.find(
      (step) => step.id === "projection_and_settlement",
    )?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.local_settlement_converged",
  );
});

test("runDuePropositionTransitions processes publish reveal and settlement in one pass", async () => {
  const harness = createArenaHarness();

  const scheduledDraft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    title: "Batch publish",
    marketEnabled: true,
    createdByUserId: "creator_batch_publish",
  });
  await harness.propositionDraftService.submitDraft({
    propositionId: scheduledDraft.id,
    userId: "creator_batch_publish",
  });
  await harness.internalPropositionOpsService.approveProposition({
    propositionId: scheduledDraft.id,
    actorUserId: "operator_batch_publish",
    publishedAt: "2026-04-18T10:00:00.000Z",
    reason: "batch_ready",
  });

  const liveProposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    minDurationSeconds: 60,
    maxDurationSeconds: 3600,
    marketEnabled: true,
    title: "Batch reveal",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: liveProposition.id,
    userId: "batch_reveal_user",
    minuteOffset: 0,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(liveProposition.id);

  const revealingProposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Batch settle",
  });
  const revealingMarket = await harness.marketRepository.findByPropositionId(
    revealingProposition.id,
  );
  assert.ok(revealingMarket);
  await createReviewedResponseForProposition(harness, {
    propositionId: revealingProposition.id,
    userId: "batch_settle_response_user",
    minuteOffset: 1,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(revealingProposition.id);
  await harness.betService.placeBet({
    propositionId: revealingProposition.id,
    marketId: revealingMarket.id,
    userId: "batch_settle_bettor_a",
    selectedOption: 0,
    stakeAmount: "15",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: revealingProposition.id,
    marketId: revealingMarket.id,
    userId: "batch_settle_bettor_b",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: revealingProposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });

  const result =
    await harness.propositionLifecycleAutomationService.runDuePropositionTransitions({
      now: "2026-04-18T10:07:00.000Z",
    });

  const published = await harness.propositionRepository.findById(scheduledDraft.id);
  const revealPrepared = await harness.propositionRepository.findById(
    liveProposition.id,
  );
  const settled = await harness.propositionRepository.findById(
    revealingProposition.id,
  );

  assert.equal(result.published.processedCount, 1);
  assert.deepEqual(result.published.propositionIds, [scheduledDraft.id]);
  assert.equal(result.revealPrepared.processedCount, 1);
  assert.deepEqual(result.revealPrepared.propositionIds, [liveProposition.id]);
  assert.equal(result.settled.processedCount, 1);
  assert.deepEqual(result.settled.propositionIds, [revealingProposition.id]);
  assert.equal(published?.status, "live");
  assert.equal(revealPrepared?.status, "revealing");
  assert.equal(settled?.status, "settled");
});

test("emergency freeze blocks new dispatch response submission and betting", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Freeze blocks entry",
  });
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: proposition.id,
    userIds: ["freeze_user"],
    assignedAt: arenaTime(160),
    expiresAt: arenaTime(170),
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);

  await controller.emergencyFreeze(
    proposition.id,
    {
      frozenAt: arenaTime(161),
      reason: "incident_response",
    } as any,
    { user: { sub: "operator_freeze" } } as any,
  );

  await assert.rejects(
    () =>
      harness.dispatchEngineService.createDispatchTasksForProposition({
        propositionId: proposition.id,
        userIds: ["another_user"],
        assignedAt: arenaTime(162),
        expiresAt: arenaTime(172),
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "dispatch_task.proposition_not_live",
  );

  await assert.rejects(
    () =>
      harness.responseService.submitResponse({
        propositionId: proposition.id,
        taskId: task!.id,
        userId: "freeze_user",
        selectedOption: 0,
        confirmationOption: 0,
        clientStartedAt: arenaTime(162, 10),
        clientSubmittedAt: arenaTime(162, 20),
        understandingAck: true,
        submittedAt: arenaTime(162, 20),
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "response.proposition_not_live",
  );

  await assert.rejects(
    () =>
      harness.betService.placeBet({
        propositionId: proposition.id,
        marketId: market!.id,
        userId: "bettor_1",
        selectedOption: 0,
        stakeAmount: "10",
        placedAt: arenaTime(162, 30),
      }),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "bet.market_not_live",
  );
});

test("sample shortage monitoring highlights live propositions nearing deadline without enough sample", async () => {
  const harness = createArenaHarness();
  const monitoring = new ArenaInternalMonitoringController(
    harness.internalMonitoringService,
  );
  const shortage = await createLiveProposition(harness, {
    title: "Shortage proposition",
  });
  const healthy = await createLiveProposition(harness, {
    title: "Healthy proposition",
  });

  for (let index = 0; index < 3; index += 1) {
    await createReviewedResponseForProposition(harness, {
      propositionId: healthy.id,
      userId: `healthy_user_${index}`,
      minuteOffset: 170 + index,
      reviewStatus: "valid",
    });
  }

  const items = await monitoring.listSampleShortage({
    now: "2026-04-18T11:00:00.000Z",
    deadlineWithinMinutes: 10,
  } as any);

  assert.equal(items.some((item) => item.propositionId === shortage.id), true);
  assert.equal(items.some((item) => item.propositionId === healthy.id), false);
  assert.equal(
    items.find((item) => item.propositionId === shortage.id)?.nearingDeadline,
    true,
  );
});

test("quality anomaly monitoring surfaces propositions with high invalid and anomaly rates", async () => {
  const harness = createArenaHarness();
  const monitoring = new ArenaInternalMonitoringController(
    harness.internalMonitoringService,
  );
  const anomaly = await createLiveProposition(harness, {
    title: "Anomalous proposition",
  });
  const normal = await createLiveProposition(harness, {
    title: "Normal proposition",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: anomaly.id,
    userId: "anomaly_user_1",
    minuteOffset: 180,
    reviewStatus: "invalid",
    flags: ["copy_paste_signal"],
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: anomaly.id,
    userId: "anomaly_user_2",
    minuteOffset: 181,
    reviewStatus: "invalid",
    flags: ["copy_paste_signal"],
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: anomaly.id,
    userId: "anomaly_user_3",
    minuteOffset: 182,
    reviewStatus: "fraud_suspected",
    flags: ["suspicious_latency"],
  });

  for (let index = 0; index < 3; index += 1) {
    await createReviewedResponseForProposition(harness, {
      propositionId: normal.id,
      userId: `normal_user_${index}`,
      minuteOffset: 190 + index,
      reviewStatus: "valid",
    });
  }

  const items = await monitoring.listAnomalies();
  const anomalyItem = items.find((item) => item.propositionId === anomaly.id);

  assert.ok(anomalyItem);
  assert.equal(items.some((item) => item.propositionId === normal.id), false);
  assert.equal((anomalyItem?.invalidRate ?? 0) > 0.3, true);
  assert.equal((anomalyItem?.anomalyRate ?? 0) > 0.3, true);
});

test("validation lifecycle drift monitoring surfaces propositions blocked on chain projection stages", async () => {
  const validationChainRuntime = createValidationChainRuntimeRecorder();
  const harness = createArenaHarness({
    validationChainRuntime: validationChainRuntime as any,
  });
  const monitoring = new ArenaInternalMonitoringController(
    harness.internalMonitoringService,
  );

  const liveDrift = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Chain create drift",
  });

  const revealDrift = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Chain freeze drift",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: revealDrift.id,
    userId: "drift_reveal_user",
    minuteOffset: 230,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(revealDrift.id);
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: revealDrift.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });
  const revealMarket = await harness.marketRepository.findByPropositionId(
    revealDrift.id,
  );
  assert.ok(revealMarket);
  await harness.marketRepository.update(revealMarket.id, {
    chainMarketId: `chain_market_${revealMarket.id}`,
    chainPropositionId: `chain_prop_${revealDrift.id}`,
    chainStatus: "live",
    chainOpenedAt: new Date("2026-04-18T10:05:30.000Z"),
    chainSyncedAt: new Date("2026-04-18T10:05:31.000Z"),
  });

  const settledDrift = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Chain resolve drift",
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    settledDrift.id,
  );
  assert.ok(settledMarket);
  await createReviewedResponseForProposition(harness, {
    propositionId: settledDrift.id,
    userId: "drift_settle_user",
    minuteOffset: 231,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(settledDrift.id);
  await harness.betService.placeBet({
    propositionId: settledDrift.id,
    marketId: settledMarket.id,
    userId: "drift_settle_bettor_a",
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.betService.placeBet({
    propositionId: settledDrift.id,
    marketId: settledMarket.id,
    userId: "drift_settle_bettor_b",
    selectedOption: 1,
    stakeAmount: "10",
    placedAt: "2026-04-18T10:05:46.000Z",
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledDrift.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(settledMarket.id, {
    chainMarketId: `chain_market_${settledMarket.id}`,
    chainPropositionId: `chain_prop_${settledDrift.id}`,
    chainStatus: "frozen",
    chainFrozenAt: new Date("2026-04-18T10:06:40.000Z"),
    chainSyncedAt: new Date("2026-04-18T10:06:41.000Z"),
  });
  await harness.marketRepository.update(settledMarket.id, {
    status: "settled",
    settledAt: new Date("2026-04-18T10:07:00.000Z"),
  });
  await harness.propositionRepository.update(settledDrift.id, {
    status: "settled",
    settledAt: new Date("2026-04-18T10:07:00.000Z"),
  });

  const items = await monitoring.listValidationLifecycleDrift();

  const liveItem = items.find((item) => item.propositionId === liveDrift.id);
  const revealItem = items.find((item) => item.propositionId === revealDrift.id);
  const settledItem = items.find((item) => item.propositionId === settledDrift.id);

  assert.ok(liveItem);
  assert.equal(liveItem?.driftReason, "chain_market_not_created");
  assert.equal(liveItem?.propositionStatus, "live");
  assert.equal(liveItem?.onChainState, null);
  assert.equal(liveItem?.operatorGuidance.kind, "queue_recovery");
  assert.equal(liveItem?.operatorGuidance.recoveryReason, "create_open_missing_market");
  assert.deepEqual(liveItem?.operatorGuidance.plannedCommands, [
    "create_market",
    "open_market",
  ]);

  assert.ok(revealItem);
  assert.equal(revealItem?.driftReason, "chain_market_not_frozen");
  assert.equal(revealItem?.propositionStatus, "revealing");
  assert.equal(revealItem?.onChainState, "live");
  assert.equal(revealItem?.operatorGuidance.kind, "queue_recovery");
  assert.equal(revealItem?.operatorGuidance.recoveryReason, "freeze_resolve_live_market");
  assert.deepEqual(revealItem?.operatorGuidance.plannedCommands, [
    "freeze_market",
    "resolve_market",
  ]);

  assert.ok(settledItem);
  assert.equal(settledItem?.driftReason, "chain_market_not_resolved");
  assert.equal(settledItem?.propositionStatus, "settled");
  assert.equal(settledItem?.onChainState, "frozen");
  assert.equal(settledItem?.operatorGuidance.kind, "queue_recovery");
  assert.equal(settledItem?.operatorGuidance.recoveryReason, "resolve_settled_market");
  assert.deepEqual(settledItem?.operatorGuidance.plannedCommands, [
    "resolve_market",
  ]);
});

test("validation lifecycle drift monitoring marks unsafe pre-live settlement drift as manual intervention", async () => {
  const harness = createArenaHarness();
  const monitoring = new ArenaInternalMonitoringController(
    harness.internalMonitoringService,
  );

  const proposition = await createLiveProposition(harness, {
    minEffectiveSample: 1,
    marketEnabled: true,
    title: "Unsafe pre-live drift",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "unsafe_pre_live_user",
    minuteOffset: 260,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "unsafe_pre_live_bettor",
    selectedOption: 0,
    stakeAmount: "15",
    placedAt: "2026-04-18T10:05:47.000Z",
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "pre_live",
    chainSyncedAt: new Date("2026-04-18T10:06:41.000Z"),
  });

  const items = await monitoring.listValidationLifecycleDrift();
  const driftItem = items.find((item) => item.propositionId === proposition.id);

  assert.ok(driftItem);
  assert.equal(driftItem?.driftReason, "chain_market_not_frozen");
  assert.equal(driftItem?.onChainState, "pre_live");
  assert.equal(driftItem?.operatorGuidance.kind, "manual_intervention");
  assert.equal(driftItem?.operatorGuidance.recoveryReason, null);
  assert.equal(
    driftItem?.operatorGuidance.operatorActions.includes(
      "docs/contracts/arena-validation-chain-runbook.md#unsafe-pre-live-drift-policy",
    ),
    true,
  );
});

test("validation-chain runtime readiness monitoring exposes deployment preflight state", async () => {
  const monitoring = new ArenaInternalMonitoringController({
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
      return null;
    },
    async getValidationChainRuntimeReadiness() {
      return {
        status: "degraded",
        checkedAt: "2026-05-24T12:00:00.000Z",
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
      };
    },
  } as any);

  const snapshot = await monitoring.getValidationChainRuntimeReadiness();

  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.validationEnvironment, "staging");
  assert.equal(snapshot.dependencies.find((item) => item.name === "rpc")?.status, "down");
  assert.equal(snapshot.runbookPath, "docs/contracts/arena-validation-chain-runbook.md");
  assert.equal(snapshot.operatorActions[0]?.dependency, "rpc");
});

test("internal monitoring runtime contract aggregates deployment-facing backend checks", async () => {
  const monitoring = new ArenaInternalMonitoringController({
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
      return null;
    },
    async getValidationChainRuntimeReadiness() {
      return {
        status: "degraded",
        checkedAt: "2026-05-24T12:00:00.000Z",
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
        operatorActions: [
          {
            dependency: "rpc",
            summary: "Restore RPC connectivity and confirm the configured chain id matches the provider.",
            envKeys: ["RPC_URL", "CHAIN_ID"],
            commands: ["pnpm run validation:deps:check", "pnpm run validation:chain:check"],
          },
        ],
      };
    },
    async getRuntimeContract() {
      return {
        status: "degraded",
        generatedAt: "2026-05-24T12:00:00.000Z",
        environment: {
          nodeEnv: "production",
          validationEnvironment: "staging",
          port: 4000,
        },
        health: {
          live: {
            status: "ok",
            timestamp: "2026-05-24T12:00:00.000Z",
          },
          readiness: {
            status: "degraded",
            timestamp: "2026-05-24T12:00:00.000Z",
            dependencies: [
              { name: "database", status: "up" },
              { name: "redis", status: "up" },
              { name: "rpc", status: "up" },
              { name: "scheduler_queue", status: "down", details: "scheduler paused" },
            ],
          },
          queues: {
            status: "degraded",
            timestamp: "2026-05-24T12:00:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "down",
                paused: true,
                details: "scheduler paused",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
              },
            ],
          },
        },
        validationChain: {
          status: "degraded",
          checkedAt: "2026-05-24T12:00:00.000Z",
          validationEnvironment: "staging",
          chainId: 8453,
          rpcUrl: "https://rpc.example",
          arenaContractAddress: "0x0000000000000000000000000000000000000001",
          validationContractAddress: "0x0000000000000000000000000000000000000002",
          dependencies: [
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
              summary: "Clear backend, queue, database, Redis, RPC, signer, and contract blockers before attempting an environment-backed validation rehearsal.",
              commands: ["GET /arena/internal/monitoring/runtime-contract"],
              evidence: ["GET /health/ready"],
            },
          ],
        },
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
            createdAt: "2026-05-24T12:00:00.000Z",
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
            createdAt: "2026-05-24T12:00:00.000Z",
          },
        },
      };
    },
  } as any);

  const snapshot = await monitoring.getRuntimeContract();

  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.environment.nodeEnv, "production");
  assert.equal(snapshot.health.readiness.dependencies.some((item) => item.name === "scheduler_queue"), true);
  assert.equal(snapshot.validationChain.runbookPath, "docs/contracts/arena-validation-chain-runbook.md");
  assert.equal(snapshot.validationRehearsal.status, "blocked");
  assert.equal(snapshot.commands.preflight.includes("pnpm run validation:preflight"), true);
  assert.deepEqual(snapshot.commands.validationLocalPrepare, [
    "pnpm run validation:prepare:local",
  ]);
  assert.equal(snapshot.releaseReadiness.status, "blocked");
  assert.equal(snapshot.releaseChecklist.some((item) => item.id === "readiness"), true);
  assert.equal(
    snapshot.releaseChecklist.find((item) => item.id === "readiness")?.status,
    "blocked",
  );
  assert.equal(
    snapshot.releaseChecklist.find((item) => item.id === "readiness")?.operatorActions.includes(
      "GET /system/queues/overview",
    ),
    true,
  );
  assert.equal(snapshot.recentAlerts[0]?.action, "runtime_contract.alert.release_blocked");
  assert.equal(snapshot.operatorSummary.status, "action_required");
  assert.equal(snapshot.operatorSummary.focusArea, "readiness");
  assert.equal(
    snapshot.operatorSummary.operatorActions.includes("GET /system/queues/overview"),
    true,
  );
});

test("internal validation chain controller exposes manual command controls with audit trail", async () => {
  const harness = createArenaHarness();
  const contract = createValidationChainContractStub();
  const prisma = {
    async $transaction<T>(callback: (tx: object) => Promise<T>): Promise<T> {
      return callback({});
    },
  };
  const ids = {
    buildChainPropositionId(propositionId: string) {
      return `chain_prop_${propositionId}`;
    },
    buildChainMarketId(marketId: string) {
      return `chain_market_${marketId}`;
    },
  };
  const commands = new ValidationChainOperatorCommandService(
    prisma as any,
    harness.propositionRepository as any,
    harness.marketRepository as any,
    ids as any,
    contract as any,
    harness.internalAuditService,
  );
  const oracle = new ValidationChainOracleService(
    prisma as any,
    harness.propositionRepository as any,
    harness.marketRepository as any,
    ids as any,
    contract as any,
    harness.internalAuditService,
  );
  const pauser = new ValidationChainPauserService(
    contract as any,
    harness.internalAuditService,
  );
  const syncWorker = {
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
  const sync = new ValidationChainManualSyncService(
    {
      async syncOnce() {
        return syncWorker.syncNow();
      },
    } as any,
    harness.internalAuditService,
  );
  const betReconciliation = {
    async reconcileBet() {
      return {
        betId: "bet_manual_chain_user",
        marketId: market.id,
        propositionId: proposition.id,
        userId: "manual_chain_user",
        localBet: {
          selectedOption: 1,
          stakeAmount: "40",
          status: "placed",
          claimed: false,
          chainSyncedAt: "2026-04-24T00:31:00.000Z",
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
      };
    },
    async reconcileUnsyncedBets(input: { limit?: number }) {
      return {
        processedAt: "2026-04-24T00:30:00.000Z",
        requestedLimit: input.limit ?? 20,
        processedCount: 0,
        matchedCount: 0,
        mismatchedCount: 0,
        failedCount: 0,
        items: [],
      };
    },
  };
  const projectionReplay = {
    async replayMarketProjection() {
      return {
        marketId: "market_1",
        propositionId: proposition.id,
        chainMarketId: `chain_market_${market.id}`,
        chainPropositionId: `chain_prop_${proposition.id}`,
        processedAt: "2026-04-24T00:35:00.000Z",
        replayedEventCount: 2,
        replayedEvents: [],
        propositionStatus: "settled",
        propositionSettledAt: "2026-04-24T00:35:00.000Z",
        finalMarketProjection: {
          chainStatus: "resolved",
          chainOpenedAt: null,
          chainFrozenAt: null,
          chainResolvedAt: null,
          chainCancelledAt: null,
          chainResultKind: "resolved",
          chainWinningOption: 0,
          chainVoidReason: null,
          resolutionTxHash: "0xreplay",
          cancelTxHash: null,
          chainSyncedAt: "2026-04-24T00:35:00.000Z",
        },
        finalBetProjections: [
          {
            betId: "bet_projection_1",
            marketId: market.id,
            propositionId: proposition.id,
            userId: "manual_chain_user",
            status: "settled",
            claimed: true,
            settlementOutcome: "won",
            grossPayout: "40",
            refundAmount: null,
            claimTxHash: "0xclaimreplay",
            refundTxHash: null,
            chainSyncedAt: "2026-04-24T00:35:30.000Z",
          },
        ],
      };
    },
  };
  const controller = new ArenaInternalValidationChainController(
    commands,
    oracle,
    pauser,
    sync,
    betReconciliation as any,
    projectionReplay as any,
    {
      async recoverQueuedCommands() {
        return {
          propositionId: proposition.id,
          marketId: market.id,
          chainMarketId: `chain_market_${market.id}`,
          chainPropositionId: `chain_prop_${proposition.id}`,
          queuedAt: "2026-04-24T00:32:00.000Z",
          propositionStatus: "revealing",
          marketStatus: "frozen_for_reveal",
          localChainStatus: "live",
          onChainState: "live",
          driftReason: "chain_market_not_frozen",
          recoveryReason: "freeze_resolve_live_market",
          plannedCommands: ["freeze_market", "resolve_market"],
        };
      },
    } as any,
    {} as any,
    harness.validationRehearsalCheckpointService,
  );

  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Manual validation chain controls",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const created = await controller.createMarket(
    proposition.id,
    {
      reason: "manual_chain_create",
      note: "operator_backfill",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  const opened = await controller.openMarket(
    proposition.id,
    {
      reason: "manual_chain_open",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "manual_chain_user",
    minuteOffset: 240,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: "2026-04-18T10:06:30.000Z",
    updatedByUserId: "admin_1",
  });

  const frozen = await controller.freezeMarket(
    proposition.id,
    {
      reason: "manual_chain_freeze",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  const resolved = await controller.resolveMarket(
    proposition.id,
    {
      reason: "manual_chain_resolve",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  const paused = await controller.pauseValidationChain(
    {
      reason: "manual_chain_pause",
    } as any,
    { user: { sub: "admin_chain" } } as any,
  );
  const unpaused = await controller.unpauseValidationChain(
    {
      reason: "manual_chain_unpause",
    } as any,
    { user: { sub: "admin_chain" } } as any,
  );

  assert.equal(created.propositionId, proposition.id);
  assert.equal(opened.marketId, market.id);
  assert.equal(frozen.chainMarketId, `chain_market_${market.id}`);
  assert.equal(resolved.chainPropositionId, `chain_prop_${proposition.id}`);
  assert.equal(paused.contractAddress, "0xvalidationcontract");
  assert.equal(unpaused.contractAddress, "0xvalidationcontract");
  const syncSnapshot = await controller.syncValidationChain(
    {
      reason: "manual_chain_sync",
      note: "runbook_recovery",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  assert.equal(syncSnapshot.streamKey, VALIDATION_CHAIN_STREAM_KEY);
  assert.equal(syncSnapshot.processedEvents, 4);
  const backlogSnapshot = await controller.reconcileUnsyncedValidationBets(
    {
      reason: "manual_chain_backlog_reconcile",
      note: "batch_triage",
      limit: 5,
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  assert.equal(backlogSnapshot.processedCount, 0);
  assert.equal(backlogSnapshot.requestedLimit, 5);
  const replaySnapshot = await controller.replayValidationMarketProjection(
    market.id,
    {
      reason: "manual_chain_projection_replay",
      note: "rebuild_projection",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  assert.equal(replaySnapshot.marketId, "market_1");
  assert.equal(replaySnapshot.replayedEventCount, 2);
  const recoverySnapshot = await controller.recoverValidationChainCommands(
    proposition.id,
    {
      reason: "manual_chain_command_recovery",
      note: "queue_recovery",
    } as any,
    { user: { sub: "operator_chain" } } as any,
    { status() {} } as any,
  );
  assert.equal(recoverySnapshot.marketId, market.id);
  assert.deepEqual(recoverySnapshot.plannedCommands, [
    "freeze_market",
    "resolve_market",
  ]);
  assert.deepEqual(
    harness.store.internalAuditEvents
      .map((event) => event.action)
      .filter((action) => action.startsWith("validation_chain."))
      .sort(),
    [
      "validation_chain.create_market.submitted",
      "validation_chain.freeze_market.submitted",
      "validation_chain.open_market.submitted",
      "validation_chain.pause.submitted",
      "validation_chain.resolve_market.submitted",
      "validation_chain.sync.manual.completed",
      "validation_chain.unpause.submitted",
    ],
  );
  const checkpoints =
    await harness.internalPropositionOpsService.listValidationRehearsalCheckpoints(
      proposition.id,
    );
  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.deepEqual(
    checkpoints.map((item) => ({
      stepId: item.stepId,
      reason: item.reason,
      txHash: item.txHash,
    })),
    [
      {
        stepId: "freeze_and_resolve",
        reason: "validation_rehearsal.auto.resolve_market_submitted",
        txHash: resolved.txHash,
      },
      {
        stepId: "freeze_and_resolve",
        reason: "validation_rehearsal.auto.freeze_market_submitted",
        txHash: frozen.txHash,
      },
      {
        stepId: "publish_and_open",
        reason: "validation_rehearsal.auto.open_market_submitted",
        txHash: opened.txHash,
      },
      {
        stepId: "publish_and_open",
        reason: "validation_rehearsal.auto.create_market_submitted",
        txHash: created.txHash,
      },
      {
        stepId: "projection_and_settlement",
        reason: "validation_rehearsal.auto.projection_settlement_converged",
        txHash: "0xreplay",
      },
    ],
  );
  assert.equal(detail.validationRehearsalCheckpoints.length, 5);
  assert.equal(
    detail.validationRehearsal.steps.find((step) => step.id === "publish_and_open")
      ?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.open_market_submitted",
  );
  assert.equal(
    detail.validationRehearsal.steps.find((step) => step.id === "freeze_and_resolve")
      ?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.resolve_market_submitted",
  );
  assert.equal(
    detail.validationRehearsal.steps.find(
      (step) => step.id === "projection_and_settlement",
    )?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.projection_settlement_converged",
  );
  assert.equal(
    detail.validationRehearsal.steps.find(
      (step) => step.id === "projection_and_settlement",
    )?.manualCheckpoint?.status,
    "complete",
  );
  const matchedReconciliation = await controller.reconcileValidationBet(
    market.id,
    "manual_chain_user",
    {
      reason: "manual_chain_bet_reconcile",
      note: "post_sync_verification",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  const detailAfterReconciliation =
    await harness.internalPropositionOpsService.getPropositionDetail(
      proposition.id,
    );

  assert.equal(matchedReconciliation.propositionId, proposition.id);
  assert.equal(matchedReconciliation.comparison.amountMatches, true);
  assert.equal(detailAfterReconciliation.validationRehearsalCheckpoints.length, 6);
  assert.equal(
    detailAfterReconciliation.validationRehearsal.steps.find(
      (step) => step.id === "local_bet_and_sync",
    )?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.bet_reconciliation_matched",
  );
});

test("manual validation chain sync records requested and failed audit context", async () => {
  const harness = createArenaHarness();
  const syncWorker = {
    async syncOnce() {
      throw new Error("rpc timeout");
    },
  };
  const service = new ValidationChainManualSyncService(
    syncWorker as any,
    harness.internalAuditService,
  );

  await assert.rejects(
    () =>
      service.syncNow({
        actorUserId: "operator_chain",
        reason: "manual_sync_retry",
        note: "after_rpc_recovery",
      }),
    (error: unknown) =>
      error instanceof Error && error.message === "rpc timeout",
  );

  assert.deepEqual(
    harness.store.internalAuditEvents.map((event) => ({
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorUserId: event.actorUserId,
      reason: event.reason,
      note: event.note,
      metadata: event.metadataJson,
    })),
    [
      {
        entityType: "validation_chain_stream",
        entityId: VALIDATION_CHAIN_STREAM_KEY,
        action: "validation_chain.sync.manual.failed",
        actorUserId: "operator_chain",
        reason: "manual_sync_retry",
        note: "after_rpc_recovery",
        metadata: {
          error: "rpc timeout",
        },
      },
    ],
  );
});

test("projection replay automatic rehearsal checkpoint stays blocked until local proposition settlement completes", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalValidationChainController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      async reconcileBet() {
        throw new Error("not used");
      },
      async reconcileUnsyncedBets() {
        throw new Error("not used");
      },
    } as any,
    {
      async replayMarketProjection() {
        return {
          marketId: proposition.id.replace("proposition", "market"),
          propositionId: proposition.id,
          chainMarketId: `chain_market_${proposition.id}`,
          chainPropositionId: `chain_prop_${proposition.id}`,
          processedAt: "2026-04-24T00:35:00.000Z",
          replayedEventCount: 3,
          replayedEvents: [],
          propositionStatus: "revealing",
          propositionSettledAt: null,
          finalMarketProjection: {
            chainStatus: "resolved",
            chainOpenedAt: null,
            chainFrozenAt: null,
            chainResolvedAt: "2026-04-24T00:30:00.000Z",
            chainCancelledAt: null,
            chainResultKind: "resolved",
            chainWinningOption: 0,
            chainVoidReason: null,
            resolutionTxHash: "0xreplayblocked",
            cancelTxHash: null,
            chainSyncedAt: "2026-04-24T00:31:00.000Z",
          },
          finalBetProjections: [
            {
              betId: "bet_projection_blocked",
              marketId: proposition.id.replace("proposition", "market"),
              propositionId: proposition.id,
              userId: "blocked_projection_user",
              status: "settled",
              claimed: true,
              settlementOutcome: "won",
              grossPayout: "25",
              refundAmount: null,
              claimTxHash: "0xclaimblocked",
              refundTxHash: null,
              chainSyncedAt: "2026-04-24T00:31:00.000Z",
            },
          ],
        };
      },
    } as any,
    {} as any,
    {} as any,
    harness.validationRehearsalCheckpointService,
  );

  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Projection replay blocked until settlement",
  });

  const replay = await controller.replayValidationMarketProjection(
    proposition.id.replace("proposition", "market"),
    {
      reason: "manual_chain_projection_replay",
      note: "await_local_settlement",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  const checkpoints =
    await harness.internalPropositionOpsService.listValidationRehearsalCheckpoints(
      proposition.id,
    );

  assert.equal(replay.propositionStatus, "revealing");
  assert.equal(replay.propositionSettledAt, null);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]?.stepId, "projection_and_settlement");
  assert.equal(
    checkpoints[0]?.reason,
    "validation_rehearsal.auto.projection_settlement_incomplete",
  );
  assert.equal(checkpoints[0]?.status, "blocked");
  assert.equal(
    checkpoints[0]?.evidence.includes("propositionStatus=revealing"),
    true,
  );
  assert.equal(
    checkpoints[0]?.evidence.includes("propositionSettledAt=missing"),
    true,
  );
});

test("internal validation chain cancel requires explicit actor and valid chain state", async () => {
  const harness = createArenaHarness();
  const contract = createValidationChainContractStub();
  const prisma = {
    async $transaction<T>(callback: (tx: object) => Promise<T>): Promise<T> {
      return callback({});
    },
  };
  const ids = {
    buildChainPropositionId(propositionId: string) {
      return `chain_prop_${propositionId}`;
    },
    buildChainMarketId(marketId: string) {
      return `chain_market_${marketId}`;
    },
  };
  const commands = new ValidationChainOperatorCommandService(
    prisma as any,
    harness.propositionRepository as any,
    harness.marketRepository as any,
    ids as any,
    contract as any,
    harness.internalAuditService,
  );
  const oracle = new ValidationChainOracleService(
    prisma as any,
    harness.propositionRepository as any,
    harness.marketRepository as any,
    ids as any,
    contract as any,
    harness.internalAuditService,
  );
  const pauser = new ValidationChainPauserService(
    contract as any,
    harness.internalAuditService,
  );
  const sync = {
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
  const controller = new ArenaInternalValidationChainController(
    commands,
    oracle,
    pauser,
    sync as any,
    {
      async reconcileUnsyncedBets() {
        return {
          processedAt: "2026-04-24T00:30:00.000Z",
          requestedLimit: 20,
          processedCount: 0,
          matchedCount: 0,
          mismatchedCount: 0,
          failedCount: 0,
          items: [],
        };
      },
    } as any,
    {
      async replayMarketProjection() {
        return {
          marketId: "market_1",
          propositionId: proposition.id,
          chainMarketId: `chain_market_${market.id}`,
          chainPropositionId: `chain_prop_${proposition.id}`,
          processedAt: "2026-04-24T00:35:00.000Z",
          replayedEventCount: 0,
          replayedEvents: [],
          propositionStatus: "live",
          propositionSettledAt: null,
          finalMarketProjection: {
            chainStatus: null,
            chainOpenedAt: null,
            chainFrozenAt: null,
            chainResolvedAt: null,
            chainCancelledAt: null,
            chainResultKind: null,
            chainWinningOption: null,
            chainVoidReason: null,
            resolutionTxHash: null,
            cancelTxHash: null,
            chainSyncedAt: null,
          },
          finalBetProjections: [],
        };
      },
    } as any,
    {
      async recoverQueuedCommands() {
        return {
          propositionId: proposition.id,
          marketId: market.id,
          chainMarketId: `chain_market_${market.id}`,
          chainPropositionId: `chain_prop_${proposition.id}`,
          queuedAt: "2026-04-24T00:32:00.000Z",
          propositionStatus: "live",
          marketStatus: "live",
          localChainStatus: null,
          onChainState: null,
          driftReason: "chain_market_not_created",
          recoveryReason: "create_open_missing_market",
          plannedCommands: ["create_market", "open_market"],
        };
      },
    } as any,
    {} as any,
    harness.validationRehearsalCheckpointService,
  );

  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Manual validation chain cancel",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await controller.createMarket(
    proposition.id,
    {
      reason: "prepare_cancel",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );

  const cancelled = await controller.cancelMarket(
    proposition.id,
    {
      reason: "manual_cancel",
      reasonCode: "operator_stop",
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );
  assert.equal(cancelled.marketId, market.id);

  await assert.rejects(
    () =>
      controller.cancelMarket(
        proposition.id,
        {
          reason: "cancel_invalid_state",
          reasonCode: "operator_stop",
        } as any,
        { user: { sub: "operator_chain" } } as any,
      ),
    (error: unknown) =>
      error instanceof ArenaConflictError &&
      error.code === "validation_chain.cancel.invalid_state",
  );

  await assert.rejects(
    () =>
      controller.cancelMarket(
        proposition.id,
        {
          reason: "cancel_without_actor",
          reasonCode: "operator_stop",
        } as any,
        { user: undefined } as any,
      ),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "validation_chain.cancel.actor_required",
  );
});

test("internal proposition detail includes validation chain activity timeline", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation chain audit timeline",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.internalAuditService.record({
    entityType: "validation_chain_command",
    entityId: proposition.id,
    action: "validation_chain.command.enqueued",
    actorUserId: "system_scheduler",
    reason: "validation_chain.runtime.publish_live",
    metadata: {
      command: "create_market",
      queueJobId: "validation-chain:create",
    },
    createdAt: new Date("2026-04-18T10:05:10.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.create_market.submitted",
    actorUserId: "operator_chain",
    reason: "manual_chain_create",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      chainPropositionId: `chain_prop_${proposition.id}`,
      chainMarketId: `chain_market_${market.id}`,
      txHash: `0x${"1".repeat(64)}`,
    },
    createdAt: new Date("2026-04-18T10:05:20.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_command",
    entityId: proposition.id,
    action: "validation_chain.command.skipped",
    actorUserId: "system_scheduler",
    reason: "validation_chain.runtime.publish_live",
    metadata: {
      command: "open_market",
      error: "Validation market cannot open from the current on-chain state",
    },
    createdAt: new Date("2026-04-18T10:05:25.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_command",
    entityId: proposition.id,
    action: "validation_chain.alert.command_terminal",
    actorUserId: null,
    reason: "validation_chain.command.retry_exhausted",
    metadata: {
      command: "open_market",
      error: "simulated terminal error",
    },
    createdAt: new Date("2026-04-18T10:05:30.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.equal(detail.validationChainActivity.marketAuditEvents.length, 1);
  assert.equal(detail.validationChainActivity.commandAuditEvents.length, 3);
  assert.deepEqual(
    detail.validationChainActivity.commandAuditEvents.map((event) => event.action),
    [
      "validation_chain.alert.command_terminal",
      "validation_chain.command.skipped",
      "validation_chain.command.enqueued",
    ],
  );
  assert.deepEqual(
    detail.validationChainActivity.timeline.map((event) => event.action),
    [
      "validation_chain.alert.command_terminal",
      "validation_chain.create_market.submitted",
      "validation_chain.command.enqueued",
    ],
  );
  assert.equal(
    detail.validationChainActivity.timeline[0]?.entityType,
    "validation_chain_command",
  );
});

test("internal proposition detail exposes proposition-scoped lifecycle drift recovery evidence", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation lifecycle recovery detail",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  harness.store.markets = harness.store.markets.filter(
    (item) => item.id !== market.id,
  );
  await harness.internalAuditService.record({
    entityType: "validation_proposition",
    entityId: proposition.id,
    action: "validation_chain.alert.lifecycle_drift",
    actorUserId: null,
    reason: "validation_chain.lifecycle_drift.market_missing.manual_intervention",
    metadata: {
      propositionId: proposition.id,
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
    createdAt: new Date("2026-04-18T10:06:10.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.equal(detail.market, null);
  assert.equal(detail.validationLifecycle.driftReason, "market_missing");
  assert.equal(detail.validationLifecycle.onChainState, null);
  assert.equal(
    detail.validationLifecycle.operatorGuidance?.kind,
    "manual_intervention",
  );
  assert.equal(
    detail.validationLifecycle.operatorGuidance?.operatorActions.includes(
      "docs/contracts/arena-validation-chain-runbook.md",
    ),
    true,
  );
  assert.equal(detail.validationOperatorSummary.status, "action_required");
  assert.equal(detail.validationOperatorSummary.requiresActionNow, true);
  assert.equal(
    detail.validationOperatorSummary.summary,
    "The local validation market row is missing. Reconstruct or investigate local market state before replaying projection or queueing chain commands.",
  );
  assert.deepEqual(detail.validationOperatorSummary.plannedCommands, []);
  assert.equal(
    detail.validationOperatorSummary.operatorActions.includes(
      "docs/contracts/arena-validation-chain-runbook.md",
    ),
    true,
  );
  assert.equal(
    detail.validationOperatorSummary.latestRelevantAudit?.action,
    "validation_chain.alert.lifecycle_drift",
  );
  assert.equal(detail.validationChainActivity.driftAuditEvents.length, 1);
  assert.equal(
    detail.validationChainActivity.driftAuditEvents[0]?.entityType,
    "validation_proposition",
  );
  assert.deepEqual(
    detail.validationChainActivity.timeline.map((event) => event.action),
    ["validation_chain.alert.lifecycle_drift"],
  );
});

test("internal proposition detail includes validation chain event failure activity", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation chain projector failure detail",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const chainPropositionId = harness.validationChainIdService.buildChainPropositionId(
    proposition.id,
  );
  const chainMarketId = harness.validationChainIdService.buildChainMarketId(market.id);

  harness.store.validationChainEvents.push(
    {
      id: "validation_event_projection_failed",
      chainId: 31337,
      contractAddress: "0xvalidationcontract",
      blockNumber: 12,
      blockHash: `0x${"2".repeat(64)}`,
      transactionHash: `0x${"3".repeat(64)}`,
      transactionIndex: 0,
      logIndex: 1,
      eventName: "MarketOpened",
      marketChainId: chainMarketId,
      propositionChainId: chainPropositionId,
      payloadJson: {
        marketId: chainMarketId,
        propositionId: chainPropositionId,
        openedAt: 1_713_434_400,
        operator: "0xoperator",
        blockTimestamp: 1_713_434_400,
      },
      processedAt: new Date("2026-04-18T10:05:35.000Z"),
    },
    {
      id: "validation_event_projection_missing",
      chainId: 31337,
      contractAddress: "0xvalidationcontract",
      blockNumber: 13,
      blockHash: `0x${"4".repeat(64)}`,
      transactionHash: `0x${"5".repeat(64)}`,
      transactionIndex: 0,
      logIndex: 2,
      eventName: "MarketResolved",
      marketChainId: chainMarketId,
      propositionChainId: chainPropositionId,
      payloadJson: {
        marketId: chainMarketId,
        propositionId: chainPropositionId,
        resultKind: "resolved",
        winningOption: 1,
        voidReason: null,
        resolvedAt: 1_713_434_460,
        oracle: "0xoracle",
        blockTimestamp: 1_713_434_460,
      },
      processedAt: new Date("2026-04-18T10:06:00.000Z"),
    },
  );

  await harness.internalAuditService.record({
    entityType: "validation_chain_event",
    entityId: "validation_event_projection_failed",
    action: "validation_chain.project.failed",
    reason: "validation_chain.project.error",
    metadata: {
      eventName: "MarketOpened",
      transactionHash: `0x${"3".repeat(64)}`,
      logIndex: 1,
      error: "simulated projection mismatch",
    },
    createdAt: new Date("2026-04-18T10:05:40.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_event",
    entityId: "validation_event_projection_missing",
    action: "validation_chain.alert.projector_entity_missing",
    reason: "validation_chain.project.entity_missing",
    metadata: {
      eventName: "MarketResolved",
      transactionHash: `0x${"5".repeat(64)}`,
      logIndex: 2,
      error: "Validation market projection target was not found",
    },
    createdAt: new Date("2026-04-18T10:06:05.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.equal(detail.validationChainActivity.eventAuditEvents.length, 2);
  assert.deepEqual(
    detail.validationChainActivity.eventAuditEvents.map((event) => event.action),
    [
      "validation_chain.alert.projector_entity_missing",
      "validation_chain.project.failed",
    ],
  );
  assert.deepEqual(
    detail.validationChainActivity.timeline.slice(0, 2).map((event) => event.action),
    [
      "validation_chain.alert.projector_entity_missing",
      "validation_chain.project.failed",
    ],
  );
  assert.equal(
    detail.validationChainActivity.timeline[0]?.entityType,
    "validation_chain_event",
  );
});

test("internal proposition detail exposes proposition-scoped recovery follow-through activity", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation chain recovery follow-through detail",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "live",
    chainSyncedAt: new Date("2026-04-18T10:05:15.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.command_recovery.partial_failure",
    actorUserId: "operator_chain",
    reason: "manual_chain_command_recovery",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      requestStatus: "partial_failure",
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
          status: "failed",
          queueJobId: null,
          delayMs: 5000,
          errorMessage: "Redis unavailable",
        },
      ],
    },
    createdAt: new Date("2026-04-18T10:05:20.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.projection_replay.performed",
    actorUserId: "operator_chain",
    reason: "manual_chain_projection_replay",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      replayedEventCount: 2,
    },
    createdAt: new Date("2026-04-18T10:05:30.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_market",
    entityId: `chain_market_${market.id}`,
    action: "validation_chain.bet_reconciliation.performed",
    actorUserId: "operator_chain",
    reason: "manual_chain_bet_reconcile",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      betId: "bet_1",
      positionExists: true,
      optionMatches: true,
      amountMatches: true,
      claimedMatches: true,
    },
    createdAt: new Date("2026-04-18T10:05:40.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_stream",
    entityId: "validation_chain_unsynced_bet_backlog",
    action: "validation_chain.bet_reconciliation.batch.performed",
    actorUserId: "operator_chain",
    reason: "manual_chain_backlog_reconcile",
    metadata: {
      requestedLimit: 5,
      processedCount: 1,
      matchedCount: 1,
      mismatchedCount: 0,
      failedCount: 0,
      propositionIds: [proposition.id],
      marketIds: [market.id],
      betIds: ["bet_1"],
    },
    createdAt: new Date("2026-04-18T10:05:50.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.deepEqual(
    detail.validationChainActivity.recoveryAuditEvents.map((event) => event.action),
    [
      "validation_chain.bet_reconciliation.batch.performed",
      "validation_chain.bet_reconciliation.performed",
      "validation_chain.projection_replay.performed",
      "validation_chain.command_recovery.partial_failure",
    ],
  );
  assert.deepEqual(
    detail.validationChainActivity.timeline.slice(0, 4).map((event) => event.action),
    [
      "validation_chain.bet_reconciliation.batch.performed",
      "validation_chain.bet_reconciliation.performed",
      "validation_chain.projection_replay.performed",
      "validation_chain.command_recovery.partial_failure",
    ],
  );
  assert.equal(detail.validationOperatorSummary.status, "ready");
  assert.equal(detail.validationOperatorSummary.requiresActionNow, false);
  assert.equal(
    detail.validationOperatorSummary.summary,
    "No active validation lifecycle drift. Latest operator evidence shows reconciliation completed.",
  );
  assert.deepEqual(detail.validationOperatorSummary.plannedCommands, []);
  assert.deepEqual(detail.validationOperatorSummary.operatorActions, []);
  assert.equal(
    detail.validationOperatorSummary.latestRelevantAudit?.action,
    "validation_chain.bet_reconciliation.batch.performed",
  );
});

test("internal proposition detail includes completed validation rehearsal progress", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation rehearsal progress proposition",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const bettor = "0x00000000000000000000000000000000000000b1";
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: bettor,
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: "2026-04-18T10:05:45.000Z",
  });

  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "resolved",
    chainOpenedAt: new Date("2026-04-18T10:05:20.000Z"),
    chainFrozenAt: new Date("2026-04-18T10:06:15.000Z"),
    chainResolvedAt: new Date("2026-04-18T10:07:00.000Z"),
    chainResultKind: "resolved",
    chainWinningOption: 0,
    resolutionTxHash: `0x${"6".repeat(64)}`,
    chainSyncedAt: new Date("2026-04-18T10:07:02.000Z"),
  });
  await harness.betRepository.update(harness.store.bets[0]!.id, {
    status: "settled",
    settlementOutcome: "won",
    grossPayout: "25",
    pnl: "0",
    claimed: false,
    chainSyncedAt: new Date("2026-04-18T10:05:50.000Z"),
  });
  await harness.propositionRepository.update(proposition.id, {
    status: "settled",
    frozenAt: new Date("2026-04-18T10:06:10.000Z"),
    revealStartedAt: new Date("2026-04-18T10:06:20.000Z"),
    resultComputedAt: new Date("2026-04-18T10:06:40.000Z"),
    resultKind: "resolved",
    winningOption: 0,
    settledAt: new Date("2026-04-18T10:07:05.000Z"),
  });

  harness.store.validationChainEvents.push(
    {
      id: "validation_event_bet_placed",
      chainId: 31337,
      contractAddress: "0xvalidationcontract",
      blockNumber: 21,
      blockHash: `0x${"7".repeat(64)}`,
      transactionHash: `0x${"8".repeat(64)}`,
      transactionIndex: 0,
      logIndex: 1,
      eventName: "BetPlaced",
      marketChainId: `chain_market_${market.id}`,
      propositionChainId: `chain_prop_${proposition.id}`,
      payloadJson: {
        marketId: `chain_market_${market.id}`,
        propositionId: `chain_prop_${proposition.id}`,
        user: bettor,
        selectedOption: 0,
        amount: "25",
        blockTimestamp: 1_713_434_750,
      },
      processedAt: new Date("2026-04-18T10:05:50.000Z"),
    },
    {
      id: "validation_event_market_resolved_progress",
      chainId: 31337,
      contractAddress: "0xvalidationcontract",
      blockNumber: 22,
      blockHash: `0x${"9".repeat(64)}`,
      transactionHash: `0x${"a".repeat(64)}`,
      transactionIndex: 0,
      logIndex: 2,
      eventName: "MarketResolved",
      marketChainId: `chain_market_${market.id}`,
      propositionChainId: `chain_prop_${proposition.id}`,
      payloadJson: {
        marketId: `chain_market_${market.id}`,
        propositionId: `chain_prop_${proposition.id}`,
        resultKind: "resolved",
        winningOption: 0,
        voidReason: null,
        resolvedAt: 1_713_434_820,
        oracle: "0xoracle",
        blockTimestamp: 1_713_434_822,
      },
      processedAt: new Date("2026-04-18T10:07:02.000Z"),
    },
  );

  await harness.internalAuditService.record({
    entityType: "validation_chain_command",
    entityId: proposition.id,
    action: "validation_chain.command.enqueued",
    actorUserId: "system_scheduler",
    reason: "validation_chain.runtime.publish_live",
    metadata: {
      command: "create_market",
      queueJobId: "validation-chain:create",
    },
    createdAt: new Date("2026-04-18T10:05:05.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.create_market.submitted",
    actorUserId: "operator_chain",
    reason: "manual_chain_create",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      chainPropositionId: `chain_prop_${proposition.id}`,
      chainMarketId: `chain_market_${market.id}`,
      txHash: `0x${"b".repeat(64)}`,
    },
    createdAt: new Date("2026-04-18T10:05:10.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_stream",
    entityId: VALIDATION_CHAIN_STREAM_KEY,
    action: "validation_chain.sync.manual.completed",
    actorUserId: "operator_chain",
    reason: "manual_sync_progress",
    metadata: {
      processedEvents: 2,
      fromBlock: 20,
      toBlock: 22,
    },
    createdAt: new Date("2026-04-18T10:05:55.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.equal(detail.validationRehearsal.status, "ready");
  assert.equal(detail.validationRehearsal.summary.completedStepCount, 5);
  assert.equal(detail.validationRehearsal.summary.remainingStepCount, 0);
  assert.equal(detail.validationRehearsal.summary.currentStepId, null);
  assert.equal(
    typeof detail.validationRehearsal.environmentReadiness.status,
    "string",
  );
  assert.equal(
    Array.isArray(
      detail.validationRehearsal.environmentReadiness.blockingDependencies,
    ),
    true,
  );
  assert.deepEqual(
    detail.validationRehearsal.steps.map((step) => ({
      id: step.id,
      status: step.status,
    })),
    [
      { id: "preflight", status: "complete" },
      { id: "publish_and_open", status: "complete" },
      { id: "local_bet_and_sync", status: "complete" },
      { id: "freeze_and_resolve", status: "complete" },
      { id: "projection_and_settlement", status: "complete" },
    ],
  );
  assert.equal(
    detail.validationRehearsal.steps[2]?.evidence.some((item) =>
      item.includes("BetPlaced"),
    ),
    true,
  );
  assert.equal(
    detail.validationRehearsal.steps[1]?.commands.includes(
      `POST /arena/internal/validation-chain/propositions/${proposition.id}/recover-command`,
    ),
    true,
  );
  assert.equal(
    detail.validationRehearsal.steps[4]?.evidence.some((item) =>
      item.includes("settlementOutcome=won"),
    ),
    true,
  );
});

test("internal proposition detail marks validation rehearsal as blocked at the current incomplete step", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Blocked validation rehearsal proposition",
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "pre_live",
    chainSyncedAt: new Date("2026-04-18T10:05:15.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.create_market.submitted",
    actorUserId: "operator_chain",
    reason: "manual_chain_create",
    metadata: {
      propositionId: proposition.id,
      marketId: market.id,
      chainPropositionId: `chain_prop_${proposition.id}`,
      chainMarketId: `chain_market_${market.id}`,
      txHash: `0x${"c".repeat(64)}`,
    },
    createdAt: new Date("2026-04-18T10:05:10.000Z"),
  });
  await harness.internalAuditService.record({
    entityType: "validation_chain_command",
    entityId: proposition.id,
    action: "validation_chain.alert.command_terminal",
    actorUserId: null,
    reason: "validation_chain.command.retry_exhausted",
    metadata: {
      command: "open_market",
      error: "rpc timeout",
    },
    createdAt: new Date("2026-04-18T10:05:25.000Z"),
  });

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );

  assert.equal(detail.validationRehearsal.status, "blocked");
  assert.equal(detail.validationRehearsal.summary.completedStepCount, 1);
  assert.equal(detail.validationRehearsal.summary.currentStepId, "publish_and_open");
  assert.equal(detail.validationRehearsal.summary.currentStepStatus, "blocked");
  assert.equal(
    typeof detail.validationRehearsal.environmentReadiness.status,
    "string",
  );
  assert.equal(
    detail.validationRehearsal.summary.nextCommands.includes(
      `POST /arena/internal/validation-chain/propositions/${proposition.id}/recover-command`,
    ),
    true,
  );
  assert.deepEqual(
    detail.validationRehearsal.steps.map((step) => ({
      id: step.id,
      status: step.status,
    })),
    [
      { id: "preflight", status: "complete" },
      { id: "publish_and_open", status: "blocked" },
      { id: "local_bet_and_sync", status: "pending" },
      { id: "freeze_and_resolve", status: "pending" },
      { id: "projection_and_settlement", status: "pending" },
    ],
  );
  assert.equal(
    detail.validationRehearsal.steps[1]?.blockingReasons.includes(
      "latest command terminal audit: open_market",
    ),
    true,
  );
  assert.equal(detail.validationRehearsal.blockingDependencies.includes("publish_and_open"), true);
});

test("validation rehearsal checkpoints persist operator evidence and surface on internal proposition detail", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation rehearsal checkpoint proposition",
  });

  const checkpoint =
    await harness.validationRehearsalCheckpointService.recordCheckpoint({
      propositionId: proposition.id,
      stepId: "publish_and_open",
      status: "complete",
      reason: "manual_stage_rehearsal",
      note: "market created and opened against staging contract",
      evidence: [
        "tx:0x1234",
        "operator-confirmed open_market completion",
      ],
      txHash: `0x${"d".repeat(64)}`,
      blockNumber: 42,
      actorUserId: "operator_chain",
      recordedAt: "2026-04-18T10:05:45.000Z",
    });

  assert.equal(checkpoint.stepId, "publish_and_open");
  assert.equal(checkpoint.status, "complete");
  assert.equal(checkpoint.txHash, `0x${"d".repeat(64)}`);

  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );
  const publishStep = detail.validationRehearsal.steps.find(
    (step) => step.id === "publish_and_open",
  );

  assert.ok(publishStep);
  assert.equal(publishStep.manualCheckpoint?.reason, "manual_stage_rehearsal");
  assert.equal(detail.validationRehearsalCheckpoints.length, 1);
  assert.equal(
    detail.validationRehearsal.summary.latestCheckpointStepId,
    "publish_and_open",
  );
  assert.equal(
    detail.validationRehearsal.summary.latestCheckpointStatus,
    "complete",
  );
  assert.equal(
    detail.validationRehearsalCheckpoints[0]?.stepId,
    "publish_and_open",
  );
  assert.equal(
    publishStep.evidence.some((item) =>
      item.includes("manualCheckpoint.txHash"),
    ),
    true,
  );
  assert.equal(
    publishStep.commands.includes(
      `POST /arena/internal/validation-chain/propositions/${proposition.id}/recover-command`,
    ),
    true,
  );
});

test("batch validation bet reconciliation persists proposition-scoped rehearsal checkpoints for affected propositions", async () => {
  const harness = createArenaHarness();
  const matchedProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Matched backlog reconciliation proposition",
  });
  const blockedProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Blocked backlog reconciliation proposition",
  });

  const controller = new ArenaInternalValidationChainController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      async reconcileBet() {
        throw new Error("not used");
      },
      async reconcileUnsyncedBets() {
        return {
          processedAt: "2026-04-18T10:12:00.000Z",
          requestedLimit: 5,
          processedCount: 3,
          matchedCount: 1,
          mismatchedCount: 1,
          failedCount: 1,
          items: [
            {
              betId: "bet_1",
              marketId: "market_matched",
              propositionId: matchedProposition.id,
              userId: "user_matched",
              status: "matched",
              reconciliation: null,
              errorCode: null,
              errorMessage: null,
            },
            {
              betId: "bet_2",
              marketId: "market_blocked",
              propositionId: blockedProposition.id,
              userId: "user_blocked_1",
              status: "mismatched",
              reconciliation: null,
              errorCode: null,
              errorMessage: null,
            },
            {
              betId: "bet_3",
              marketId: "market_blocked",
              propositionId: blockedProposition.id,
              userId: "user_blocked_2",
              status: "failed",
              reconciliation: null,
              errorCode: "validation_chain.reconcile.unexpected_error",
              errorMessage: "rpc timeout",
            },
          ],
        };
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    harness.validationRehearsalCheckpointService,
  );

  const snapshot = await controller.reconcileUnsyncedValidationBets(
    {
      reason: "manual_chain_backlog_reconcile",
      note: "batch_triage",
      limit: 5,
    } as any,
    { user: { sub: "operator_chain" } } as any,
  );

  const matchedDetail =
    await harness.internalPropositionOpsService.getPropositionDetail(
      matchedProposition.id,
    );
  const blockedDetail =
    await harness.internalPropositionOpsService.getPropositionDetail(
      blockedProposition.id,
    );

  assert.equal(snapshot.processedCount, 3);
  assert.equal(
    matchedDetail.validationRehearsal.steps.find(
      (step) => step.id === "local_bet_and_sync",
    )?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.batch_bet_reconciliation_matched",
  );
  assert.equal(
    matchedDetail.validationRehearsal.steps.find(
      (step) => step.id === "local_bet_and_sync",
    )?.manualCheckpoint?.status,
    "complete",
  );
  assert.equal(
    blockedDetail.validationRehearsal.steps.find(
      (step) => step.id === "local_bet_and_sync",
    )?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.batch_bet_reconciliation_incomplete",
  );
  assert.equal(
    blockedDetail.validationRehearsal.steps.find(
      (step) => step.id === "local_bet_and_sync",
    )?.manualCheckpoint?.status,
    "blocked",
  );
});

test("validation rehearsal checkpoints can be listed directly for operator execution audit", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation rehearsal checkpoint list proposition",
  });

  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "publish_and_open",
    status: "complete",
    reason: "manual_stage_open_complete",
    evidence: ["tx:0xaaa1"],
    actorUserId: "operator_chain",
    recordedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "freeze_and_resolve",
    status: "blocked",
    reason: "awaiting_oracle_result",
    note: "result not submitted yet",
    evidence: ["oracle pending"],
    actorUserId: "operator_chain",
    recordedAt: "2026-04-18T10:12:00.000Z",
  });

  const checkpoints =
    await harness.internalPropositionOpsService.listValidationRehearsalCheckpoints(
      proposition.id,
    );

  assert.equal(checkpoints.length, 2);
  assert.deepEqual(
    checkpoints.map((item) => ({
      stepId: item.stepId,
      status: item.status,
      reason: item.reason,
    })),
    [
      {
        stepId: "freeze_and_resolve",
        status: "blocked",
        reason: "awaiting_oracle_result",
      },
      {
        stepId: "publish_and_open",
        status: "complete",
        reason: "manual_stage_open_complete",
      },
    ],
  );
});

test("validation rehearsal checkpoint history preserves repeated step attempts while detail uses the latest step checkpoint", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation rehearsal repeated step checkpoint proposition",
  });

  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "publish_and_open",
    status: "blocked",
    reason: "initial_publish_attempt_blocked",
    note: "awaiting operator retry",
    evidence: ["rpc timeout"],
    actorUserId: "operator_chain",
    recordedAt: "2026-04-18T10:05:45.000Z",
  });
  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "publish_and_open",
    status: "complete",
    reason: "retry_publish_attempt_complete",
    note: "market opened after retry",
    evidence: ["tx:0xbbb2"],
    txHash: `0x${"b".repeat(64)}`,
    actorUserId: "operator_chain",
    recordedAt: "2026-04-18T10:09:15.000Z",
  });

  const checkpoints =
    await harness.internalPropositionOpsService.listValidationRehearsalCheckpoints(
      proposition.id,
    );
  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );
  const publishStep = detail.validationRehearsal.steps.find(
    (step) => step.id === "publish_and_open",
  );

  assert.equal(checkpoints.length, 2);
  assert.deepEqual(
    checkpoints.map((item) => ({
      stepId: item.stepId,
      status: item.status,
      reason: item.reason,
    })),
    [
      {
        stepId: "publish_and_open",
        status: "complete",
        reason: "retry_publish_attempt_complete",
      },
      {
        stepId: "publish_and_open",
        status: "blocked",
        reason: "initial_publish_attempt_blocked",
      },
    ],
  );
  assert.ok(publishStep);
  assert.equal(
    publishStep.manualCheckpoint?.reason,
    "retry_publish_attempt_complete",
  );
  assert.equal(
    publishStep.manualCheckpoint?.txHash,
    `0x${"b".repeat(64)}`,
  );
  assert.equal(
    detail.validationRehearsal.summary.latestCheckpointStepId,
    "publish_and_open",
  );
  assert.equal(
    detail.validationRehearsal.summary.latestCheckpointStatus,
    "complete",
  );
  assert.equal(detail.validationRehearsalCheckpoints.length, 2);
});

test("validation rehearsal checkpoint history keeps publish/open automation order stable when timestamps tie", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Validation rehearsal tied automation checkpoint proposition",
  });
  const recordedAt = "2026-04-18T10:09:15.000Z";

  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "publish_and_open",
    status: "complete",
    reason: "validation_rehearsal.auto.create_market_submitted",
    evidence: ["tx:0xaaa1"],
    txHash: `0x${"a".repeat(64)}`,
    actorUserId: "operator_chain",
    recordedAt,
  });
  await harness.validationRehearsalCheckpointService.recordCheckpoint({
    propositionId: proposition.id,
    stepId: "publish_and_open",
    status: "complete",
    reason: "validation_rehearsal.auto.open_market_submitted",
    evidence: ["tx:0xbbb2"],
    txHash: `0x${"b".repeat(64)}`,
    actorUserId: "operator_chain",
    recordedAt,
  });

  const checkpoints =
    await harness.internalPropositionOpsService.listValidationRehearsalCheckpoints(
      proposition.id,
    );
  const detail = await harness.internalPropositionOpsService.getPropositionDetail(
    proposition.id,
  );
  const publishStep = detail.validationRehearsal.steps.find(
    (step) => step.id === "publish_and_open",
  );

  assert.deepEqual(
    checkpoints.map((item) => item.reason),
    [
      "validation_rehearsal.auto.open_market_submitted",
      "validation_rehearsal.auto.create_market_submitted",
    ],
  );
  assert.equal(
    publishStep?.manualCheckpoint?.reason,
    "validation_rehearsal.auto.open_market_submitted",
  );
});

test("reward audit detail and retriggered correction preserve ledger history", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const proposition = await createLiveProposition(harness, {
    title: "Reward correction proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_audit_user",
    minuteOffset: 200,
    reviewStatus: "valid",
  });
  const initialLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(response.id);

  await harness.responseReviewRepository.update(response.id, {
    status: "invalid",
    qualityScore: 0,
    flags: ["manual_correction_signal"],
    reasonCodes: ["integrity_violation"],
    reviewedByUserId: "reviewer_2",
    reviewedAt: new Date(arenaTime(201, 0)),
  });

  const before = await controller.getReward(initialLedger!.id);
  const corrected = await controller.retriggerReviewResolution(
    initialLedger!.id,
    {
      resolvedAt: arenaTime(202),
      reason: "reward_chain_correction",
      note: "replay_current_review_resolution",
    } as any,
    { user: { sub: "operator_reward" } } as any,
  );
  const list = await controller.listRewards({
    propositionId: proposition.id,
  } as any);

  assert.equal(before.chain.length, 1);
  assert.equal(corrected.chain.length, 2);
  assert.equal(corrected.chain[0]?.status, "reversed");
  assert.equal(corrected.chain[1]?.status, "voided");
  assert.equal(list.totalCount, 2);
  assert.equal(list.items.length, 2);
  assert.equal(corrected.auditEvents.length, 1);
  assert.equal(harness.store.rewardLedgers.length, 2);
});

test("internal proposition export returns complete audit summary sections", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Export proposition",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "export_user",
    minuteOffset: 210,
    reviewStatus: "valid",
  });
  await controller.emergencyFreeze(
    proposition.id,
    {
      frozenAt: arenaTime(211),
      reason: "export_ready",
    } as any,
    { user: { sub: "operator_export" } } as any,
  );
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);
  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "pre_live",
    chainSyncedAt: new Date(arenaTime(211, 15)),
  });

  const exported = await controller.exportProposition(proposition.id);

  assert.equal(exported.proposition.id, proposition.id);
  assert.equal(typeof exported.exportedAt, "string");
  assert.equal(exported.dispatchSummary.totalTasks, 1);
  assert.equal(exported.reviewSummary.finalizedCount, 1);
  assert.equal(exported.sampleCounter.totalResponses, 1);
  assert.equal(exported.rewardSummary.rewardEntries.length, 1);
  assert.equal(exported.revealSettlement.marketStatus, "frozen_for_reveal");
  assert.equal(exported.market?.chainMarketId, `chain_market_${market.id}`);
  assert.equal(exported.market?.chainStatus, "pre_live");
  assert.equal(exported.market?.chainSyncedAt, arenaTime(211, 15));
  assert.equal(exported.validationLifecycle.marketId, market.id);
  assert.equal(
    exported.validationLifecycle.chainPropositionId,
    `chain_prop_${proposition.id}`,
  );
  assert.equal(exported.validationLifecycle.chainStatus, "pre_live");
  assert.equal(
    exported.validationLifecycle.driftReason,
    "chain_market_not_frozen",
  );
  assert.equal(exported.validationLifecycle.onChainState, "pre_live");
  assert.equal(
    exported.validationLifecycle.operatorGuidance?.kind,
    "manual_intervention",
  );
  assert.equal(exported.validationLifecycle.operatorGuidance?.recoveryReason, null);
  assert.equal(
    exported.validationLifecycle.operatorGuidance?.operatorActions.includes(
      `/arena/internal/validation-chain/propositions/${proposition.id}/cancel-market`,
    ),
    true,
  );
  assert.equal(exported.validationRehearsal.summary.currentStepId, "publish_and_open");
  assert.equal(
    typeof exported.validationRehearsal.environmentReadiness.status,
    "string",
  );
  assert.equal(Array.isArray(exported.validationRehearsalCheckpoints), true);
  assert.equal(exported.validationRehearsalCheckpoints.length, 0);
  assert.equal(exported.auditEvents.length, 1);
});

test("internal proposition evidence bundle combines proposition export with runtime contract snapshot", async () => {
  const harness = createArenaHarness({
    validationChainAlerts: {
      async getHealthSnapshot() {
        return {
          streamKey: "validation_market_main",
          chainId: 1337,
          contractAddress: "0x0000000000000000000000000000000000000002",
          syncStatus: "idle",
          lastProcessedBlock: 123,
          lastProcessedTxHash: "0xproof",
          lastProcessedLogIndex: 0,
          lastFinalizedBlock: 123,
          cursorUpdatedAt: arenaTime(231, 30),
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
        } as any;
      },
    } as any,
  });
  const controller = new ArenaInternalPropositionsController(
    harness.internalPropositionOpsService,
  );
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Evidence bundle proposition",
  });

  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);
  await harness.marketRepository.update(market.id, {
    chainMarketId: `chain_market_${market.id}`,
    chainPropositionId: `chain_prop_${proposition.id}`,
    chainStatus: "pre_live",
    chainSyncedAt: new Date(arenaTime(231, 10)),
  });
  await harness.internalAuditService.record({
    entityType: "validation_market",
    entityId: market.id,
    action: "validation_chain.alert.lifecycle_drift",
    actorUserId: null,
    reason: "validation_chain.lifecycle_drift.chain_market_not_opened.queue_recovery",
    metadata: {
      propositionId: proposition.id,
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
          `/arena/internal/validation-chain/propositions/${proposition.id}/recover-command`,
        ],
      },
    },
    createdAt: new Date("2026-04-18T13:57:00.000Z"),
  });

  const bundle = await controller.exportPropositionEvidenceBundle(proposition.id);

  assert.equal(bundle.propositionId, proposition.id);
  assert.equal(typeof bundle.exportedAt, "string");
  assert.equal(bundle.propositionExport.proposition.id, proposition.id);
  assert.equal(bundle.propositionExport.market?.chainMarketId, `chain_market_${market.id}`);
  assert.equal(bundle.propositionExport.validationLifecycle.onChainState, "pre_live");
  assert.equal(
    bundle.propositionExport.validationLifecycle.operatorGuidance?.recoveryReason,
    "open_pre_live_market",
  );
  assert.equal(
    bundle.propositionExport.validationOperatorSummary.status,
    "action_required",
  );
  assert.equal(
    bundle.propositionExport.validationOperatorSummary.requiresActionNow,
    true,
  );
  assert.deepEqual(
    bundle.propositionExport.validationOperatorSummary.plannedCommands,
    ["open_market"],
  );
  assert.equal(
    bundle.propositionExport.validationOperatorSummary.operatorActions.includes(
      `/arena/internal/validation-chain/propositions/${proposition.id}/recover-command`,
    ),
    true,
  );
  assert.equal(
    bundle.propositionExport.validationOperatorSummary.latestRelevantAudit?.action,
    "validation_chain.alert.lifecycle_drift",
  );
  assert.equal(
    bundle.propositionExport.validationChainActivity.driftAuditEvents.length,
    1,
  );
  assert.equal(
    bundle.propositionExport.validationChainActivity.driftAuditEvents[0]?.action,
    "validation_chain.alert.lifecycle_drift",
  );
  assert.equal(typeof bundle.runtimeContract.status, "string");
  assert.equal(
    Array.isArray(bundle.runtimeContract.commands.validationLocalPrepare),
    true,
  );
  assert.equal(bundle.validationChainHealth?.syncStatus, "idle");
  assert.equal(bundle.validationChainHealth?.lastProcessedBlock, 123);
  assert.equal(bundle.validationChainHealth?.metrics.recentSyncFailureCount, 0);
  assert.equal(
    bundle.runtimeContract.commands.validationLocalPrepare.includes(
      "pnpm run validation:prepare:local",
    ),
    true,
  );
});

test("public and respondent surfaces do not expose internal ops audit fields", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Boundary proposition",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "boundary_user",
    minuteOffset: 220,
    reviewStatus: "valid",
  });

  const publicController = createPublicController(harness);
  const rewardsController = new ArenaRespondentRewardsController(
    new RewardViewService(
      harness.propositionRepository as any,
      harness.rewardLedgerService as any,
    ),
  );

  const progress = await publicController.getPropositionProgress(proposition.id);
  const rewards = await rewardsController.listRewards({
    user: { sub: "boundary_user" },
  } as any);

  assert.equal("auditEvents" in progress, false);
  assert.equal("dispatchSummary" in progress, false);
  assert.equal("auditEvents" in (rewards[0] ?? {}), false);
  assert.equal("metadata" in (rewards[0] ?? {}), false);
});

test("respondent result summary exposes settled outcome for the current user only after settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Result summary proposition",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "result_reader_1",
    minuteOffset: 240,
    reviewStatus: "valid",
  });

  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "result_reader_1",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: arenaTime(241),
  });

  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: arenaTime(242),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: arenaTime(243),
  });

  const controller = new ArenaRespondentResultsController(
    new ResultViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.rewardLedgerService as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );

  const summary = await controller.getOwnResultSummary(proposition.id, {
    user: { sub: "result_reader_1" },
  } as any);

  assert.equal(summary.propositionId, proposition.id);
  assert.equal(summary.resultKind, "resolved");
  assert.equal(summary.winningOption, 0);
  assert.equal(summary.voidReason, null);
  assert.equal(typeof summary.settledAt, "string");
  assert.equal(summary.currentUserRewardStatus, "finalized");
  assert.equal(summary.currentUserSettlementOutcome, "won");
  assertInternalIdentityAbsentRecursively(summary);
});

test("respondent result summary rejects unresolved propositions", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Result unavailable proposition",
  });
  const controller = new ArenaRespondentResultsController(
    new ResultViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.rewardLedgerService as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );

  await assert.rejects(
    () =>
      controller.getOwnResultSummary(proposition.id, {
        user: { sub: "result_reader_2" },
      } as any),
    (error: unknown) =>
      error instanceof ArenaValidationError &&
      error.code === "result.summary_not_available",
  );
});

test("respondent result list aggregates settled outcomes reward amounts and position totals", async () => {
  const harness = createArenaHarness();
  const settledResolved = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Resolved result list proposition",
    category: "ai",
  });
  const resolvedMarket = await harness.marketRepository.findByPropositionId(
    settledResolved.id,
  );
  assert.ok(resolvedMarket);

  await createReviewedResponseForProposition(harness, {
    propositionId: settledResolved.id,
    userId: "result_list_user",
    minuteOffset: 250,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(settledResolved.id);
  await harness.betService.placeBet({
    propositionId: settledResolved.id,
    marketId: resolvedMarket.id,
    userId: "result_list_user",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: arenaTime(251),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledResolved.id,
    now: arenaTime(252),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: settledResolved.id,
    settledAt: arenaTime(253),
  });

  const settledVoid = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Void result list proposition",
    category: "sports",
  });
  const voidMarket = await harness.marketRepository.findByPropositionId(
    settledVoid.id,
  );
  assert.ok(voidMarket);

  await harness.betService.placeBet({
    propositionId: settledVoid.id,
    marketId: voidMarket.id,
    userId: "result_list_user",
    selectedOption: 1,
    stakeAmount: "30",
    placedAt: arenaTime(254),
  });
  await harness.propositionRepository.update(settledVoid.id, {
    status: "settled",
    resultKind: "void",
    voidReason: "tie",
    winningOption: null,
    resultComputedAt: new Date(arenaTime(255)),
    settledAt: new Date(arenaTime(256)),
  });
  await harness.marketRepository.update(voidMarket.id, {
    status: "settled",
    settledAt: new Date(arenaTime(256)),
  });
  await harness.betRepository.update(harness.store.bets.find((bet) =>
    bet.propositionId === settledVoid.id && bet.userId === "result_list_user"
  )!.id, {
    status: "settled",
    settledAt: new Date(arenaTime(256)),
    settlementOutcome: "refund",
    grossPayout: "30",
    pnl: "0",
    refundAmount: "30",
  });

  const controller = new ArenaRespondentResultsController(
    new ResultViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.rewardLedgerService as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );

  const resultList = await controller.listOwnResults({
    user: { sub: "result_list_user" },
  } as any);

  assertInternalIdentityAbsentRecursively(resultList);
  assert.equal(resultList.totals.settledCount, 2);
  assert.equal(resultList.totals.resolvedCount, 1);
  assert.equal(resultList.totals.voidCount, 1);
  assert.equal(resultList.totals.wonCount, 1);
  assert.equal(resultList.totals.refundCount, 1);
  assert.equal(resultList.totals.finalizedRewardAmount, "20.00");
  assert.equal(resultList.totals.pendingRewardAmount, "0.00");
  assert.equal(resultList.totals.totalStakeAmount, "55.00");
  assert.equal(resultList.totals.totalGrossPayout, "55.00");
  assert.equal(resultList.totals.totalPnl, "0.00");
  assert.equal(resultList.totals.totalRefundAmount, "30.00");

  assert.equal(resultList.items.length, 2);
  assert.equal(resultList.items[0]?.settledAt >= resultList.items[1]!.settledAt, true);
  assert.equal(
    resultList.items.some(
      (item) =>
        item.propositionId === settledResolved.id &&
        item.currentUserSettlementOutcome === "won" &&
        item.currentUserRewardStatus === "finalized" &&
        item.currentUserRewardAmount === "20",
    ),
    true,
  );
  assert.equal(
    resultList.items.some(
      (item) =>
        item.propositionId === settledVoid.id &&
        item.currentUserSettlementOutcome === "refund" &&
        item.currentUserRefundAmount === "30",
    ),
    true,
  );
});

test("respondent result overview includes settled results open positions and recent activity", async () => {
  const harness = createArenaHarness();

  const settledResolved = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Overview settled proposition",
    category: "ai",
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    settledResolved.id,
  );
  assert.ok(settledMarket);

  await createReviewedResponseForProposition(harness, {
    propositionId: settledResolved.id,
    userId: "result_overview_user",
    minuteOffset: 260,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(settledResolved.id);
  await harness.betService.placeBet({
    propositionId: settledResolved.id,
    marketId: settledMarket.id,
    userId: "result_overview_user",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: arenaTime(261),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledResolved.id,
    now: arenaTime(262),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: settledResolved.id,
    settledAt: arenaTime(263),
  });

  const openProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Overview open proposition",
    category: "sports",
  });
  const openMarket = await harness.marketRepository.findByPropositionId(
    openProposition.id,
  );
  assert.ok(openMarket);
  await harness.betService.placeBet({
    propositionId: openProposition.id,
    marketId: openMarket.id,
    userId: "result_overview_user",
    selectedOption: 1,
    stakeAmount: "40",
    placedAt: arenaTime(264),
  });
  await harness.counterService.rebuildCounterForProposition(openProposition.id);

  const controller = new ArenaRespondentResultsController(
    new ResultViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.rewardLedgerService as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );

  const overview = await controller.getOwnResultOverview({
    user: { sub: "result_overview_user" },
  } as any);

  assertInternalIdentityAbsentRecursively(overview);
  assert.equal(overview.settledResults.totals.settledCount, 1);
  assert.equal(overview.openPositions.totalCount, 1);
  assert.equal(overview.openPositions.totalStakeAmount, "40.00");
  assert.equal(overview.openPositions.items[0]?.propositionId, openProposition.id);
  assert.equal(overview.openPositions.items[0]?.selectedOption, 1);
  assert.equal(overview.openPositions.items[0]?.selectedOptionLabel, "B");
  assert.equal(overview.openPositions.items[0]?.marketStatus, "live");
  assert.equal(overview.openPositions.categoryExposure.length, 1);
  assert.equal(overview.openPositions.categoryExposure[0]?.category, "sports");
  assert.equal(
    overview.openPositions.categoryExposure[0]?.totalStakeAmount,
    "40.00",
  );
  assert.equal(overview.summary.trackedEntryCount, 2);
  assert.equal(overview.summary.settledSharePercent, 50);
  assert.equal(overview.summary.openPositionSharePercent, 50);
  assert.equal(overview.summary.largestExposure?.category, "sports");
  assert.equal(overview.summary.largestExposure?.sharePercent, 100);
  assert.equal(overview.performance.trackedSettledPnlCount, 1);
  assert.equal(overview.performance.positiveSettledPnlCount, 0);
  assert.equal(overview.performance.negativeSettledPnlCount, 0);
  assert.equal(overview.performance.flatSettledPnlCount, 1);
  assert.equal(overview.performance.positiveSettledPnlRate, 0);
  assert.equal(overview.performance.averageSettledPnlAmount, "0.00");
  assert.equal(overview.analytics.assetBreakdown.trackedAmount, "85.00");
  assert.equal(
    overview.analytics.assetBreakdown.settledGrossPayoutAmount,
    "25.00",
  );
  assert.equal(overview.analytics.assetBreakdown.openStakeAmount, "40.00");
  assert.equal(overview.analytics.assetBreakdown.rewardAmount, "20.00");
  assert.equal(
    overview.analytics.assetBreakdown.finalizedRewardAmount,
    "20.00",
  );
  assert.equal(overview.analytics.assetBreakdown.pendingRewardAmount, "0.00");
  assert.equal(
    overview.analytics.assetBreakdown.settledGrossPayoutSharePercent,
    29,
  );
  assert.equal(overview.analytics.assetBreakdown.openStakeSharePercent, 47);
  assert.equal(overview.analytics.assetBreakdown.rewardSharePercent, 24);
  assert.equal(overview.analytics.positionStructure.totalCount, 1);
  assert.equal(overview.analytics.positionStructure.longCount, 0);
  assert.equal(overview.analytics.positionStructure.shortCount, 1);
  assert.equal(overview.analytics.positionStructure.liveCount, 1);
  assert.equal(overview.analytics.positionStructure.revealingCount, 0);
  assert.equal(overview.analytics.positionStructure.shortSharePercent, 100);
  assert.equal(overview.analytics.positionStructure.liveSharePercent, 100);
  assert.equal(
    overview.analytics.settlementDistribution.trackedSettledPnlCount,
    1,
  );
  assert.equal(overview.analytics.settlementDistribution.positiveCount, 0);
  assert.equal(overview.analytics.settlementDistribution.negativeCount, 0);
  assert.equal(overview.analytics.settlementDistribution.flatCount, 1);
  assert.equal(
    overview.analytics.settlementDistribution.flatSharePercent,
    100,
  );
  assert.equal(
    overview.performance.bestSettledPnl?.propositionId,
    settledResolved.id,
  );
  assert.equal(
    overview.performance.worstSettledPnl?.propositionId,
    settledResolved.id,
  );
  assert.equal(overview.recentActivity.length >= 2, true);
  assert.equal(
    overview.recentActivity.some(
      (item) =>
        item.activityType === "position_opened" &&
        item.propositionId === openProposition.id,
    ),
    true,
  );
  assert.equal(
    overview.recentActivity.some(
      (item) =>
        item.activityType === "result_settled" &&
        item.propositionId === settledResolved.id,
    ),
    true,
  );
});

test("respondent account overview aggregates rewards reputation tags and result overview", async () => {
  const harness = createArenaHarness();

  const settledResolved = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Account overview settled proposition",
    category: "ai",
  });
  const settledMarket = await harness.marketRepository.findByPropositionId(
    settledResolved.id,
  );
  assert.ok(settledMarket);

  await createReviewedResponseForProposition(harness, {
    propositionId: settledResolved.id,
    userId: "account_overview_user",
    minuteOffset: 270,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(settledResolved.id);
  await harness.betService.placeBet({
    propositionId: settledResolved.id,
    marketId: settledMarket.id,
    userId: "account_overview_user",
    selectedOption: 0,
    stakeAmount: "25",
    placedAt: arenaTime(271),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: settledResolved.id,
    now: arenaTime(272),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: settledResolved.id,
    settledAt: arenaTime(273),
  });

  const openProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Account overview open proposition",
    category: "sports",
  });
  const openMarket = await harness.marketRepository.findByPropositionId(
    openProposition.id,
  );
  assert.ok(openMarket);
  await harness.betService.placeBet({
    propositionId: openProposition.id,
    marketId: openMarket.id,
    userId: "account_overview_user",
    selectedOption: 1,
    stakeAmount: "40",
    placedAt: arenaTime(274),
  });
  await harness.counterService.rebuildCounterForProposition(openProposition.id);

  const controller = new ArenaRespondentAccountController(
    new AccountViewService(
      new RewardViewService(
        harness.propositionRepository as any,
        harness.rewardLedgerService as any,
      ),
      harness.reputationService,
      harness.tagService,
      new ResultViewService(
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.rewardLedgerService as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
    harness.accountPreferencesService,
    harness.watchlistService,
    harness.accountExportService,
  );

  const overview = await controller.getOwnAccountOverview({
    user: { sub: "account_overview_user" },
  } as any);

  assertInternalIdentityAbsentRecursively(overview);
  assert.equal(overview.rewardSummary.currentCount, 1);
  assert.equal(overview.rewardSummary.pendingAmount, "0.00");
  assert.equal(overview.rewardSummary.finalizedAmount, "20.00");
  assert.equal(overview.rewards.length >= 1, true);
  assertInternalIdentityAbsentRecursively(overview.reputation);
  assert.equal(
    overview.reputation.metrics.reviewedResponseCount >= 1,
    true,
  );
  assertInternalIdentityAbsentRecursively(overview.tags);
  assertInternalIdentityAbsentRecursively(overview.resultOverview);
  assert.equal(overview.resultOverview.settledResults.totals.settledCount, 1);
  assert.equal(overview.resultOverview.openPositions.totalCount, 1);
  assert.equal(overview.resultOverview.summary.trackedEntryCount, 2);
  assert.equal(overview.resultOverview.performance.trackedSettledPnlCount, 1);
  assert.equal(
    overview.resultOverview.analytics.assetBreakdown.openStakeAmount,
    "40.00",
  );
  assert.equal(
    overview.resultOverview.analytics.positionStructure.totalCount,
    1,
  );
  assert.equal(
    overview.resultOverview.openPositions.items[0]?.propositionId,
    openProposition.id,
  );
});

test("respondent account preferences return defaults and persist updates", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaRespondentAccountController(
    new AccountViewService(
      new RewardViewService(
        harness.propositionRepository as any,
        harness.rewardLedgerService as any,
      ),
      harness.reputationService,
      harness.tagService,
      new ResultViewService(
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.rewardLedgerService as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
    harness.accountPreferencesService,
    harness.watchlistService,
    harness.accountExportService,
  );

  const request = {
    user: {
      sub: "account_preferences_user",
    },
  } as any;

  const initial = await controller.getOwnAccountPreferences(request);
  assertInternalIdentityAbsentRecursively(initial);
  assert.equal(initial.notificationPreferences.emailSettlement, false);
  assert.equal(initial.profile.avatarStyle, "initial");
  assert.equal(initial.wallet.metricView, "usdc");
  assert.equal(initial.updatedAt, null);

  const updated = await controller.updateOwnAccountPreferences(
    {
      notificationPreferences: {
        ...initial.notificationPreferences,
        emailSettlement: true,
        dailyDigest: true,
      },
      profile: {
        ...initial.profile,
        avatarStyle: "image",
        landingView: "positions",
        profileVisibility: "public",
      },
      privacy: {
        ...initial.privacy,
        showSettledHistory: true,
      },
      security: {
        ...initial.security,
        twoFactorEnabled: true,
      },
      devices: {
        ...initial.devices,
        rememberTrustedDevice: false,
      },
      wallet: {
        ...initial.wallet,
        walletConnected: true,
        metricView: "shares",
        timeDisplay: "relative",
      },
      exports: {
        ...initial.exports,
        period: "90d",
        maskWalletAddress: false,
      },
      developer: {
        ...initial.developer,
        keyCreated: true,
        codeEnabled: true,
        scope: "team",
        environment: "production",
      },
    },
    request,
  );

  assert.equal(updated.notificationPreferences.emailSettlement, true);
  assert.equal(updated.notificationPreferences.dailyDigest, true);
  assert.equal(updated.profile.avatarStyle, "image");
  assert.equal(updated.profile.landingView, "positions");
  assert.equal(updated.profile.profileVisibility, "public");
  assert.equal(updated.wallet.metricView, "shares");
  assert.equal(updated.wallet.timeDisplay, "relative");
  assert.equal(updated.developer.scope, "team");
  assert.equal(updated.developer.environment, "production");
  assert.equal(typeof updated.updatedAt, "string");

  const reloaded = await controller.getOwnAccountPreferences(request);
  assert.deepEqual(reloaded, updated);
});

test("respondent watchlist saves lists and removes saved markets for the current user", async () => {
  const harness = createArenaHarness();

  const firstProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Watchlist first proposition",
    category: "sports",
  });
  const secondProposition = await createLiveProposition(harness, {
    marketEnabled: true,
    title: "Watchlist second proposition",
    category: "ai",
  });

  const firstMarket = await harness.marketRepository.findByPropositionId(firstProposition.id);
  const secondMarket = await harness.marketRepository.findByPropositionId(secondProposition.id);
  assert.ok(firstMarket);
  assert.ok(secondMarket);

  const controller = new ArenaRespondentAccountController(
    new AccountViewService(
      new RewardViewService(
        harness.propositionRepository as any,
        harness.rewardLedgerService as any,
      ),
      harness.reputationService,
      harness.tagService,
      new ResultViewService(
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.rewardLedgerService as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
    harness.accountPreferencesService,
    harness.watchlistService,
    harness.accountExportService,
  );

  const request = {
    user: {
      sub: "watchlist_user",
    },
  } as any;

  const empty = await controller.getOwnWatchlist(request);
  assert.equal(empty.totalCount, 0);
  assert.deepEqual(empty.items, []);

  const savedFirst = await controller.saveOwnWatchlistItem(
    { marketId: firstMarket.id },
    request,
  );
  assert.equal(savedFirst.isSaved, true);
  assert.equal(savedFirst.marketId, firstMarket.id);
  assert.equal(savedFirst.propositionId, firstProposition.id);
  assert.equal(typeof savedFirst.savedAt, "string");

  const savedSecond = await controller.saveOwnWatchlistItem(
    { marketId: secondMarket.id },
    request,
  );
  assert.equal(savedSecond.isSaved, true);

  const dedupedFirst = await controller.saveOwnWatchlistItem(
    { marketId: firstMarket.id },
    request,
  );
  assert.equal(dedupedFirst.isSaved, true);

  const listed = await controller.getOwnWatchlist(request);
  assert.equal(listed.totalCount, 2);
  assert.equal(listed.items[0]?.marketId, firstMarket.id);
  assert.equal(listed.items[0]?.propositionTitle, "Watchlist first proposition");
  assert.equal(listed.items[1]?.marketId, secondMarket.id);
  assert.equal(listed.items[1]?.category, "ai");

  const removed = await controller.removeOwnWatchlistItem(firstMarket.id, request);
  assert.equal(removed.isSaved, false);
  assert.equal(removed.marketId, firstMarket.id);
  assert.equal(removed.savedAt, null);

  const afterRemoval = await controller.getOwnWatchlist(request);
  assert.equal(afterRemoval.totalCount, 1);
  assert.deepEqual(
    afterRemoval.items.map((item) => item.marketId),
    [secondMarket.id],
  );
});

test("respondent account exports create and list real export records for the current user", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaRespondentAccountController(
    new AccountViewService(
      new RewardViewService(
        harness.propositionRepository as any,
        harness.rewardLedgerService as any,
      ),
      harness.reputationService,
      harness.tagService,
      new ResultViewService(
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.rewardLedgerService as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
    harness.accountPreferencesService,
    harness.watchlistService,
    harness.accountExportService,
  );

  const request = {
    user: {
      sub: "account_export_user",
    },
  } as any;

  await harness.userIdentityService.ensureUserExists("account_export_user");
  await harness.userRepository.updatePrimaryWalletAddress(
    "account_export_user",
    "0x1234567890abcdef1234567890abcdef1234abcd",
  );

  await createReviewedResponse(harness, {
    userId: "account_export_user",
    category: "ai",
    minuteOffset: 1,
    reviewStatus: "valid",
  });

  const initial = await controller.getOwnAccountExports(request);
  assert.equal(initial.totalCount, 0);
  assert.deepEqual(initial.items, []);

  const currentPreferences = await controller.getOwnAccountPreferences(request);
  await controller.updateOwnAccountPreferences(
    {
      notificationPreferences: currentPreferences.notificationPreferences,
      profile: currentPreferences.profile,
      privacy: currentPreferences.privacy,
      security: currentPreferences.security,
      devices: currentPreferences.devices,
      wallet: {
        ...currentPreferences.wallet,
        walletConnected: true,
      },
      exports: {
        period: "90d",
        includeSettlementAttachment: true,
        maskWalletAddress: true,
      },
      developer: currentPreferences.developer,
    },
    request,
  );

  const exported = await controller.createOwnAccountExport({}, request);
  assertInternalIdentityAbsentRecursively(exported);
  assert.equal(exported.status, "completed");
  assert.equal(exported.format, "json");
  assert.equal(exported.period, "90d");
  assertInternalIdentityAbsentRecursively(exported.overview);
  assertInternalIdentityAbsentRecursively(exported.preferences);
  assert.equal(exported.fileName.endsWith(".json"), true);
  assert.equal(exported.walletAddress, "0x1234...abcd");
  assert.equal(exported.settlementAttachment?.openPositionCount, 0);
  assert.equal(exported.overview.rewards.length >= 1, true);

  const listed = await controller.getOwnAccountExports(request);
  assert.equal(listed.totalCount, 1);
  assert.equal(listed.items[0]?.exportId, exported.exportId);
  assert.equal(listed.items[0]?.metrics.rewardCount >= 1, true);
  assert.equal(listed.items[0]?.includeSettlementAttachment, true);
});

test("respondent account exports return stored artifact detail for the current user", async () => {
  const harness = createArenaHarness();
  const controller = new ArenaRespondentAccountController(
    new AccountViewService(
      new RewardViewService(
        harness.propositionRepository as any,
        harness.rewardLedgerService as any,
      ),
      harness.reputationService,
      harness.tagService,
      new ResultViewService(
        harness.propositionRepository as any,
        harness.counterRepository as any,
        harness.rewardLedgerService as any,
        harness.marketRepository as any,
        harness.betRepository as any,
      ),
    ),
    harness.accountPreferencesService,
    harness.watchlistService,
    harness.accountExportService,
  );

  const request = {
    user: {
      sub: "account_export_detail_user",
    },
  } as any;

  await harness.userIdentityService.ensureUserExists("account_export_detail_user");
  await harness.userRepository.updatePrimaryWalletAddress(
    "account_export_detail_user",
    "0xabcdefabcdefabcdefabcdefabcdefabcdef4321",
  );

  const currentPreferences = await controller.getOwnAccountPreferences(request);
  await controller.updateOwnAccountPreferences(
    {
      notificationPreferences: currentPreferences.notificationPreferences,
      profile: currentPreferences.profile,
      privacy: currentPreferences.privacy,
      security: currentPreferences.security,
      devices: currentPreferences.devices,
      wallet: {
        ...currentPreferences.wallet,
        walletConnected: true,
      },
      exports: {
        ...currentPreferences.exports,
        maskWalletAddress: true,
      },
      developer: currentPreferences.developer,
    },
    request,
  );

  await createReviewedResponse(harness, {
    userId: "account_export_detail_user",
    category: "ai",
    minuteOffset: 3,
    reviewStatus: "valid",
  });

  const exported = await controller.createOwnAccountExport({}, request);
  const detail = await controller.getOwnAccountExport(
    exported.exportId,
    request,
  );

  assert.equal(detail.exportId, exported.exportId);
  assert.equal(detail.fileName, exported.fileName);
  assertInternalIdentityAbsentRecursively(detail.overview);
  assertInternalIdentityAbsentRecursively(detail.preferences);
  assert.equal(detail.status, "completed");
  assert.equal(detail.walletAddress, "0xabcd...4321");
});

test("discussion stays hidden before settlement and opens after settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Discussion boundary proposition",
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  const controller = new ArenaDiscussionController(harness.discussionService);

  const hiddenThread = await controller.getMarketDiscussion(market.id);
  assert.equal(hiddenThread.availability, "pre_settlement_hidden");
  assert.equal(hiddenThread.totalCount, 0);
  assert.deepEqual(hiddenThread.comments, []);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_settle_user_1",
    minuteOffset: 291,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_settle_user_2",
    minuteOffset: 292,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_settle_user_3",
    minuteOffset: 293,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "discussion_settle_bettor",
    chainId: 1,
    selectedOption: 0,
    stakeAmount: "10",
    placedAt: arenaTime(293, 30),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: arenaTime(294),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: arenaTime(295),
  });

  const openedThread = await controller.getMarketDiscussion(market.id);
  assert.equal(openedThread.availability, "settled");
  assert.equal(openedThread.totalCount, 0);
});

test("discussion controller persists settled comments newest-first", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Discussion write proposition",
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_1",
    minuteOffset: 301,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_2",
    minuteOffset: 302,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_3",
    minuteOffset: 303,
    reviewStatus: "valid",
  });
  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "discussion_writer_bettor",
    chainId: 1,
    selectedOption: 0,
    stakeAmount: "10",
    placedAt: arenaTime(303, 30),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: arenaTime(304),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: arenaTime(305),
  });

  await harness.userRepository.create({
    id: "discussion_author_a",
    primaryWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    normalizedPrimaryWalletAddress:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "active",
  });

  const controller = new ArenaDiscussionController(harness.discussionService);
  const firstThread = await controller.createComment(
    market.id,
    {
      propositionId: proposition.id,
      body: "结算后我更认同 A，因为有效样本已经闭环。",
      optionIndex: 0,
      createdAt: arenaTime(306),
    },
    {
      user: {
        sub: "discussion_author_a",
      },
    } as any,
  );

  assert.equal(firstThread.totalCount, 1);
  assert.equal(firstThread.comments[0]?.optionIndex, 0);
  assert.equal(firstThread.comments[0]?.author, "Arena aaaa");
  assert.equal(firstThread.comments[0]?.handle, "@aaaaaaaaaa");
  assert.equal(firstThread.comments[0]?.author, "Arena aaaa");
  assert.equal(firstThread.comments[0]?.handle, "@aaaaaaaaaa");
  assert.equal(
    firstThread.comments[0]?.body,
    "结算后我更认同 A，因为有效样本已经闭环。",
  );

  const secondThread = await controller.createComment(
    market.id,
    {
      propositionId: proposition.id,
      body: "我更关注结算后披露的证据标准，而不是盘中方向。",
      createdAt: arenaTime(307),
    },
    {
      user: {
        sub: "discussion_author_b",
      },
    } as any,
  );

  assert.equal(secondThread.totalCount, 2);
  assert.equal(
    secondThread.comments[0]?.body,
    "我更关注结算后披露的证据标准，而不是盘中方向。",
  );
  assert.equal(
    secondThread.comments[1]?.body,
    "结算后我更认同 A，因为有效样本已经闭环。",
  );
});

test("internal controllers remain protected by role guard while public controller stays open", () => {
  const guard = new RolesGuard(new Reflector());
  const internalController = new ArenaInternalPropositionsController({} as any);
  const internalValidationChainController = new ArenaInternalValidationChainController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const publicController = new ArenaPublicController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const buildContext = (controllerClass: any, handler: Function, user?: unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  assert.throws(
    () =>
      guard.canActivate(
        buildContext(ArenaInternalPropositionsController, internalController.listPropositions, {
          sub: "plain_user",
          roles: [SystemRole.User],
        }),
      ),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(
    guard.canActivate(
      buildContext(ArenaInternalPropositionsController, internalController.listPropositions, {
        sub: "operator_user",
        roles: [SystemRole.Operator],
      }),
    ),
    true,
  );
  assert.equal(
    guard.canActivate(
      buildContext(
        ArenaInternalValidationChainController,
        internalValidationChainController.createMarket,
        {
          sub: "operator_user",
          roles: [SystemRole.Operator],
        },
      ),
    ),
    true,
  );
  assert.throws(
    () =>
      guard.canActivate(
        buildContext(
          ArenaInternalValidationChainController,
          internalValidationChainController.pauseValidationChain,
          {
            sub: "operator_user",
            roles: [SystemRole.Operator],
          },
        ),
      ),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(
    guard.canActivate(
      buildContext(
        ArenaInternalValidationChainController,
        internalValidationChainController.pauseValidationChain,
        {
          sub: "admin_user",
          roles: [SystemRole.Admin],
        },
      ),
    ),
    true,
  );
  assert.equal(
    guard.canActivate(
      buildContext(ArenaPublicController, publicController.getPropositionProgress),
      ),
    true,
  );
});
