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
import { PublicDiscoveryService } from "../../src/arena/services/public-discovery.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
import { ValidationChainOperatorCommandService } from "../../src/arena/validation-chain/validation-chain-operator-command.service";
import { ValidationChainOracleService } from "../../src/arena/validation-chain/validation-chain-oracle.service";
import { ValidationChainPauserService } from "../../src/arena/validation-chain/validation-chain-pauser.service";
import {
  ValidationChainContractError,
  ValidationContractMarketState,
} from "../../src/arena/validation-chain/validation-chain.types";
import { createArenaHarness } from "./harness";

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
    category?: "general" | "sports" | "ai" | "brand_research" | "politics" | "entertainment";
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
    category?: "general" | "sports" | "ai" | "brand_research" | "politics" | "entertainment";
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

async function createParticipationHistory(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    userId: string;
    category: "general" | "sports" | "ai" | "brand_research" | "politics" | "entertainment";
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
    category: "general" | "sports" | "ai" | "brand_research" | "politics" | "entertainment";
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
  assert.equal("userId" in (rewards[0] ?? {}), false);
  assert.equal("updatedAt" in (rewards[0] ?? {}), false);
});

test("public controller keeps live reads progress-only and adds published result after settlement", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
  });
  const publicController = new ArenaPublicController(
    harness.counterService,
    new ValidationViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );

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
  const politicsDirectory = await discoveryController.getCategoryDirectory("politics");

  assert.equal(home.featuredMarketIds.length >= 1, true);
  assert.equal(home.sections.some((section) => section.href === "/zh"), true);
  assert.equal(home.sections.some((section) => section.href === "/zh/breaking"), true);
  assert.equal(hot.items.length >= 3, true);
  assert.equal(hot.items.some((item) => item.title === "Discovery sports proposition"), true);
  assert.equal("marketBias" in (hot.items[0] ?? {}), false);
  assert.equal(latest.items.length >= 3, true);
  assert.equal(latest.items.some((item) => item.id === "latest"), true);
  assert.equal(politicsDirectory?.title, "Politics");
  assert.equal(
    politicsDirectory?.marketIds.includes(
      (
        await harness.marketRepository.findByPropositionId(politics.id)
      )!.id,
    ),
    true,
  );
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

  assert.equal(selfView.userId, "rep_reader_1");
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

  assert.equal(selfView.userId, "tag_reader_1");
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

  assert.ok(revealItem);
  assert.equal(revealItem?.driftReason, "chain_market_not_frozen");
  assert.equal(revealItem?.propositionStatus, "revealing");

  assert.ok(settledItem);
  assert.equal(settledItem?.driftReason, "chain_market_not_resolved");
  assert.equal(settledItem?.propositionStatus, "settled");
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
  const controller = new ArenaInternalValidationChainController(
    commands,
    oracle,
    pauser,
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
  assert.deepEqual(
    harness.store.internalAuditEvents.map((event) => event.action).sort(),
    [
      "validation_chain.create_market.submitted",
      "validation_chain.freeze_market.submitted",
      "validation_chain.open_market.submitted",
      "validation_chain.pause.submitted",
      "validation_chain.resolve_market.submitted",
      "validation_chain.unpause.submitted",
    ],
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
  const controller = new ArenaInternalValidationChainController(
    commands,
    oracle,
    pauser,
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
  assert.equal(detail.validationChainActivity.commandAuditEvents.length, 2);
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
  assert.equal(list.length, 2);
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
  assert.equal(exported.auditEvents.length, 1);
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

  const publicController = new ArenaPublicController(
    harness.counterService,
    new ValidationViewService(
      harness.propositionRepository as any,
      harness.counterRepository as any,
      harness.marketRepository as any,
      harness.betRepository as any,
    ),
  );
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
  assert.equal("userId" in summary, false);
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

  assert.equal(resultList.userId, "result_list_user");
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

  assert.equal(overview.userId, "result_overview_user");
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

  assert.equal(overview.userId, "account_overview_user");
  assert.equal(overview.rewardSummary.currentCount, 1);
  assert.equal(overview.rewardSummary.pendingAmount, "0.00");
  assert.equal(overview.rewardSummary.finalizedAmount, "20.00");
  assert.equal(overview.rewards.length >= 1, true);
  assert.equal(overview.reputation.userId, "account_overview_user");
  assert.equal(
    overview.reputation.metrics.reviewedResponseCount >= 1,
    true,
  );
  assert.equal(overview.tags.userId, "account_overview_user");
  assert.equal(overview.resultOverview.userId, "account_overview_user");
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
  assert.equal(initial.userId, "account_preferences_user");
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
  assert.equal(exported.userId, "account_export_user");
  assert.equal(exported.status, "completed");
  assert.equal(exported.format, "json");
  assert.equal(exported.period, "90d");
  assert.equal(exported.overview.userId, "account_export_user");
  assert.equal(exported.preferences.userId, "account_export_user");
  assert.equal(exported.fileName.endsWith(".json"), true);
  assert.equal(exported.walletAddress?.includes("..."), true);
  assert.equal(exported.settlementAttachment?.openPositionCount, 0);
  assert.equal(exported.overview.rewards.length >= 1, true);

  const listed = await controller.getOwnAccountExports(request);
  assert.equal(listed.totalCount, 1);
  assert.equal(listed.items[0]?.exportId, exported.exportId);
  assert.equal(listed.items[0]?.metrics.rewardCount >= 1, true);
  assert.equal(listed.items[0]?.includeSettlementAttachment, true);
});

test("internal controllers remain protected by role guard while public controller stays open", () => {
  const guard = new RolesGuard(new Reflector());
  const internalController = new ArenaInternalPropositionsController({} as any);
  const internalValidationChainController = new ArenaInternalValidationChainController(
    {} as any,
    {} as any,
    {} as any,
  );
  const publicController = new ArenaPublicController({} as any, {} as any);

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
