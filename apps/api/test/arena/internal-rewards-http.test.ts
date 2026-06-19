import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import {
  CanActivate,
  ExecutionContext,
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

import { ArenaInternalRewardsController } from "../../src/arena/internal-rewards.controller";
import { InternalRewardAuditService } from "../../src/arena/services/internal-reward-audit.service";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

const requestJson = async (
  baseUrl: string,
  path: string,
  input: {
    method?: "GET" | "POST";
    user?: TestUser;
    body?: unknown;
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

  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.parse("2026-04-18T10:06:00.000Z") +
      minuteOffset * 60_000 +
      secondOffset * 1000,
  ).toISOString();

const createLiveProposition = async (
  harness: ArenaHarness,
  overrides: Partial<typeof propositionDraftInput> = {},
) => {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
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

const createReviewedResponseForProposition = async (
  harness: ArenaHarness,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
    reviewStatus: "valid" | "partial_valid" | "invalid";
  },
) => {
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
    confirmationOption: input.reviewStatus === "partial_valid" ? 1 : 0,
    clientStartedAt: arenaTime(input.minuteOffset, 1),
    clientSubmittedAt: arenaTime(input.minuteOffset, 12),
    submittedAt: arenaTime(input.minuteOffset, 12),
    understandingAck: true,
  });

  if (input.reviewStatus === "valid") {
    await harness.responseReviewService.reviewValid({
      responseId: response.id,
      reviewedAt: arenaTime(input.minuteOffset, 30),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      reasonCodes: ["passes_quality_review"],
    });
    return response;
  }

  if (input.reviewStatus === "partial_valid") {
    await harness.responseReviewService.reviewPartialValid({
      responseId: response.id,
      reviewedAt: arenaTime(input.minuteOffset, 30),
      reviewedByUserId: "reviewer_1",
      qualityScore: 60,
      flags: ["attention_mismatch"],
      reasonCodes: ["attention_mismatch"],
    });
    return response;
  }

  await harness.responseReviewService.reviewInvalid({
    responseId: response.id,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: 0,
    flags: ["integrity_violation"],
    reasonCodes: ["integrity_violation"],
  });
  return response;
};

const seedRewardLedger = async (
  harness: ArenaHarness,
  userId: string,
  options?: {
    userOptions?: {
      walletAddress?: string | undefined;
    };
  },
) => {
  const walletAddress =
    options?.userOptions &&
    Object.prototype.hasOwnProperty.call(options.userOptions, "walletAddress")
      ? options.userOptions.walletAddress
      : "0x00000000000000000000000000000000000000c1";
  await harness.userRepository.create({
    id: userId,
    primaryWalletAddress: walletAddress,
    normalizedPrimaryWalletAddress: walletAddress?.toLowerCase(),
    status: "active",
  } as never);

  const proposition = await createLiveProposition(harness, {
    title: `Reward HTTP proposition ${userId}`,
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId,
    minuteOffset: 26,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);
  return ledger!;
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
  options?: Parameters<typeof createArenaHarness>[0],
): Promise<void> => {
  const harness = createArenaHarness(options);
  const logger: Pick<PinoLogger, "setContext" | "warn" | "error"> = {
    setContext() {},
    warn() {},
    error() {},
  };

  @Module({
    controllers: [ArenaInternalRewardsController],
    providers: [
      {
        provide: InternalRewardAuditService,
        useValue: harness.internalRewardAuditService,
      },
      {
        provide: PinoLogger,
        useValue: logger,
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
      {
        provide: Reflector,
        useValue: new Reflector(),
      },
    ],
  })
  class TestArenaHttpModule {}

  const app = await NestFactory.create(TestArenaHttpModule, {
    logger: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const port =
    typeof address === "object" && address !== null ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to resolve HTTP test port");
  }

  try {
    await callback({
      app,
      baseUrl: `http://127.0.0.1:${port}`,
      harness,
    });
  } finally {
    await app.close();
  }
};

test(
  "internal reward payout routes advance from approval to confirmed completion with the recorded execution tx hash",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const ledger = await seedRewardLedger(harness, "http_reward_confirm_user");
      const operator = {
        userId: "operator_reward",
        roles: [SystemRole.Operator],
      };

      const approved = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/approve-payout`,
        {
          method: "POST",
          body: {
            approvedAt: arenaTime(27),
            reason: "operator_approved_reward_payout",
          },
          user: operator,
        },
      );
      assert.equal(approved.status, HttpStatus.CREATED);
      assert.equal(approved.body.payout.status, "approved");

      const started = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/start-payout-execution`,
        {
          method: "POST",
          body: {
            startedAt: arenaTime(28),
            reason: "wallet_transfer_broadcast_started",
          },
          user: operator,
        },
      );
      assert.equal(started.status, HttpStatus.CREATED);
      assert.equal(started.body.payout.status, "executing");
      assert.equal(
        started.body.payout.executionTxHash,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      );

      const confirmed = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/confirm-payout-execution`,
        {
          method: "POST",
          body: {
            confirmedAt: arenaTime(29),
            reason: "wallet_transfer_chain_confirmed",
            externalReference: "http_confirm_001",
          },
          user: operator,
        },
      );

      assert.equal(confirmed.status, HttpStatus.CREATED);
      assert.equal(confirmed.body.payout.status, "completed");
      assert.equal(
        confirmed.body.payout.executionTxHash,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      );
      assert.equal(confirmed.body.payout.externalReference, "http_confirm_001");
    });
  },
);

test(
  "internal reward payout confirm route keeps the payout executing when on-chain verification fails",
  async () => {
    await withHttpArenaApp(
      async ({ baseUrl, harness }) => {
        const ledger = await seedRewardLedger(
          harness,
          "http_reward_confirm_failure_user",
        );
        const operator = {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        };

        await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/approve-payout`,
          {
            method: "POST",
            body: {
              approvedAt: arenaTime(27),
              reason: "operator_approved_reward_payout",
            },
            user: operator,
          },
        );

        await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/start-payout-execution`,
          {
            method: "POST",
            body: {
              startedAt: arenaTime(28),
              reason: "wallet_transfer_broadcast_started",
            },
            user: operator,
          },
        );

        const confirmResponse = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/confirm-payout-execution`,
          {
            method: "POST",
            body: {
              confirmedAt: arenaTime(29),
              reason: "wallet_transfer_chain_confirmed",
              externalReference: "http_confirm_fail_001",
            },
            user: operator,
          },
        );

        assert.equal(confirmResponse.status, HttpStatus.CONFLICT);
        assert.equal(
          confirmResponse.body.error.code,
          "reward_payout.transaction_mismatch",
        );

        const detail = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}`,
          {
            method: "GET",
            user: operator,
          },
        );

        assert.equal(detail.status, HttpStatus.OK);
        assert.equal(detail.body.payout.status, "executing");
        assert.equal(
          detail.body.payout.executionTxHash,
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        );
      },
      {
        rewardPayoutVerificationPlan: [
          {
            type: "failure",
            code: "reward_payout.transaction_mismatch",
            message:
              "The submitted reward payout transaction did not emit a matching ERC20 Transfer event",
          },
        ],
      },
    );
  },
);

test(
  "internal reward payout routes support failed execution retries without leaking stale transfer identifiers",
  async () => {
    await withHttpArenaApp(
      async ({ baseUrl, harness }) => {
        const ledger = await seedRewardLedger(
          harness,
          "http_reward_retry_execution_user",
        );
        const operator = {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        };

        const approved = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/approve-payout`,
          {
            method: "POST",
            body: {
              approvedAt: arenaTime(27),
              reason: "operator_approved_reward_payout",
            },
            user: operator,
          },
        );
        assert.equal(approved.status, HttpStatus.CREATED);
        assert.equal(approved.body.payout.status, "approved");

        const started = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/start-payout-execution`,
          {
            method: "POST",
            body: {
              startedAt: arenaTime(28),
              reason: "wallet_transfer_broadcast_started",
              note: "initial payout attempt",
            },
            user: operator,
          },
        );
        assert.equal(started.status, HttpStatus.CREATED);
        assert.equal(started.body.payout.status, "executing");
        assert.equal(started.body.payout.retryCount, 0);
        assert.equal(
          started.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000d1",
        );
        assert.equal(
          started.body.payout.externalReference,
          "http_retry_batch_001",
        );

        const failed = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/fail-payout`,
          {
            method: "POST",
            body: {
              failedAt: arenaTime(29),
              reason: "wallet_transfer_failed",
              note: "manual failure after rpc timeout",
              errorCode: "rpc_timeout",
              errorMessage: "RPC timed out while broadcasting transfer",
            },
            user: operator,
          },
        );
        assert.equal(failed.status, HttpStatus.CREATED);
        assert.equal(failed.body.payout.status, "failed");
        assert.equal(failed.body.payout.lastErrorCode, "rpc_timeout");
        assert.equal(
          failed.body.payout.lastErrorMessage,
          "RPC timed out while broadcasting transfer",
        );
        assert.equal(
          failed.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000d1",
        );
        assert.equal(
          failed.body.payout.externalReference,
          "http_retry_batch_001",
        );

        const retryApproved = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/approve-payout`,
          {
            method: "POST",
            body: {
              approvedAt: arenaTime(30),
              reason: "operator_retry_approved",
              note: "retry approved after investigation",
            },
            user: operator,
          },
        );
        assert.equal(retryApproved.status, HttpStatus.CREATED);
        assert.equal(retryApproved.body.payout.status, "approved");
        assert.equal(retryApproved.body.payout.lastErrorCode, null);
        assert.equal(retryApproved.body.payout.lastErrorMessage, null);

        const retryStarted = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/start-payout-execution`,
          {
            method: "POST",
            body: {
              startedAt: arenaTime(31),
              reason: "wallet_transfer_retry_started",
              note: "broadcasting retry attempt",
            },
            user: operator,
          },
        );
        assert.equal(retryStarted.status, HttpStatus.CREATED);
        assert.equal(retryStarted.body.payout.status, "executing");
        assert.equal(retryStarted.body.payout.retryCount, 1);
        assert.equal(
          retryStarted.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000d2",
        );
        assert.equal(retryStarted.body.payout.externalReference, null);
        assert.equal(retryStarted.body.payout.lastErrorCode, null);
        assert.equal(retryStarted.body.payout.lastErrorMessage, null);

        const detail = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}`,
          {
            method: "GET",
            user: operator,
          },
        );
        assert.equal(detail.status, HttpStatus.OK);
        assert.equal(detail.body.payout.status, "executing");
        assert.equal(detail.body.payout.retryCount, 1);
        assert.equal(
          detail.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000d2",
        );
        assert.equal(detail.body.payout.externalReference, null);
      },
      {
        rewardPayoutExecutionPlan: [
          {
            type: "success",
            executionTxHash:
              "0x00000000000000000000000000000000000000000000000000000000000000d1",
            externalReference: "http_retry_batch_001",
          },
          {
            type: "success",
            executionTxHash:
              "0x00000000000000000000000000000000000000000000000000000000000000d2",
          },
        ],
      },
    );
  },
);

test(
  "internal reward audit retrigger route preserves ledger history after a review correction",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const proposition = await createLiveProposition(harness, {
        title: "Reward correction HTTP proposition",
      });
      const response = await createReviewedResponseForProposition(harness, {
        propositionId: proposition.id,
        userId: "http_reward_retrigger_user",
        minuteOffset: 40,
        reviewStatus: "valid",
      });
      const initialLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
        response.id,
      );
      assert.ok(initialLedger);

      await harness.responseReviewRepository.update(response.id, {
        status: "invalid",
        qualityScore: 0,
        flags: ["manual_correction_signal"],
        reasonCodes: ["integrity_violation"],
        reviewedByUserId: "reviewer_2",
        reviewedAt: new Date(arenaTime(41)),
      });

      const operator = {
        userId: "operator_reward",
        roles: [SystemRole.Operator],
      };

      const before = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${initialLedger.id}`,
        {
          method: "GET",
          user: operator,
        },
      );
      assert.equal(before.status, HttpStatus.OK);
      assert.equal(before.body.chain.length, 1);
      assert.equal(before.body.chain[0].status, "finalized");

      const retriggered = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${initialLedger.id}/retrigger-review-resolution`,
        {
          method: "POST",
          body: {
            resolvedAt: arenaTime(42),
            reason: "reward_chain_correction",
            note: "replay_current_review_resolution",
          },
          user: operator,
        },
      );

      assert.equal(retriggered.status, HttpStatus.CREATED);
      assert.notEqual(retriggered.body.ledgerId, initialLedger.id);
      assert.equal(retriggered.body.currentReview.status, "invalid");
      assert.equal(retriggered.body.chain.length, 2);
      assert.equal(retriggered.body.chain[0].ledgerId, initialLedger.id);
      assert.equal(retriggered.body.chain[0].status, "reversed");
      assert.equal(retriggered.body.chain[0].reasonCode, "review_corrected");
      assert.equal(retriggered.body.chain[1].ledgerId, retriggered.body.ledgerId);
      assert.equal(retriggered.body.chain[1].status, "voided");
      assert.equal(retriggered.body.chain[1].reasonCode, "invalid_review");
      assert.equal(
        retriggered.body.chain[1].reversalOfLedgerId,
        initialLedger.id,
      );
      assert.equal(retriggered.body.auditEvents.length, 1);
      assert.equal(
        retriggered.body.auditEvents[0].action,
        "reward_review_resolution_retriggered",
      );
      assert.equal(
        retriggered.body.auditEvents[0].actorUserId,
        "operator_reward",
      );

      const list = await requestJson(baseUrl, "/arena/internal/rewards", {
        method: "GET",
        user: operator,
      });
      assert.equal(list.status, HttpStatus.OK);
      assert.equal(list.body.totalCount, 2);
      assert.equal(list.body.items.length, 2);
      assert.equal(list.body.items[0].responseId, response.id);
      assert.equal(list.body.items[1].responseId, response.id);
      assert.deepEqual(
        list.body.items.map((item: { status: string }) => item.status).sort(),
        ["reversed", "voided"],
      );
    });
  },
);

test(
  "internal reward complete route marks an executing payout completed after verification succeeds",
  async () => {
    await withHttpArenaApp(
      async ({ baseUrl, harness }) => {
        const ledger = await seedRewardLedger(
          harness,
          "http_reward_complete_success_user",
        );
        const operator = {
          userId: "operator_reward",
          roles: [SystemRole.Operator],
        };

        const approved = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/approve-payout`,
          {
            method: "POST",
            body: {
              approvedAt: arenaTime(43),
              reason: "operator_approved_reward_payout",
            },
            user: operator,
          },
        );
        assert.equal(approved.status, HttpStatus.CREATED);
        assert.equal(approved.body.payout.status, "approved");

        const started = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/start-payout-execution`,
          {
            method: "POST",
            body: {
              startedAt: arenaTime(44),
              reason: "wallet_transfer_broadcast_started",
            },
            user: operator,
          },
        );
        assert.equal(started.status, HttpStatus.CREATED);
        assert.equal(started.body.payout.status, "executing");
        assert.equal(
          started.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        );

        const completed = await requestJson(
          baseUrl,
          `/arena/internal/rewards/${ledger.id}/complete-payout`,
          {
            method: "POST",
            body: {
              completedAt: arenaTime(45),
              reason: "wallet_transfer_confirmed",
              note: "verified through complete-payout route",
              externalReference: "http_complete_001",
            },
            user: operator,
          },
        );

        assert.equal(completed.status, HttpStatus.CREATED);
        assert.equal(completed.body.payout.status, "completed");
        assert.equal(
          completed.body.payout.executionTxHash,
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        );
        assert.equal(completed.body.payout.externalReference, "http_complete_001");
        assert.equal(
          completed.body.auditEvents[0].action,
          "reward_payout_completed",
        );
        assert.equal(
          completed.body.auditEvents[0].actorUserId,
          "operator_reward",
        );
      },
      {
        rewardPayoutExecutionPlan: [
          {
            type: "success",
            executionTxHash:
              "0x00000000000000000000000000000000000000000000000000000000000000e1",
          },
        ],
        rewardPayoutVerificationPlan: [{ type: "success" }],
      },
    );
  },
);

test(
  "internal reward list filters payout work queues by payout status",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const requestedLedger = await seedRewardLedger(
        harness,
        "http_reward_list_requested_user",
      );
      const failedLedger = await seedRewardLedger(
        harness,
        "http_reward_list_failed_user",
      );
      const failedPayout = await harness.rewardPayoutRepository.findByLedgerId(
        failedLedger.id,
      );
      assert.ok(failedPayout);

      await harness.rewardPayoutService.approvePayout({
        payoutId: failedPayout.id,
        actorUserId: "operator_reward",
        approvedAt: arenaTime(5),
      });
      await harness.rewardPayoutService.failPayout({
        payoutId: failedPayout.id,
        failedAt: arenaTime(6),
        errorCode: "rpc_timeout",
        errorMessage: "Broadcast timed out while sending payout",
      });

      const failedList = await requestJson(
        baseUrl,
        "/arena/internal/rewards?payoutStatus=failed",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(failedList.status, HttpStatus.OK);
      assert.equal(failedList.body.totalCount, 1);
      assert.equal(failedList.body.items.length, 1);
      assert.equal(failedList.body.items[0].ledgerId, failedLedger.id);
      assert.equal(failedList.body.items[0].payoutStatus, "failed");

      const requestedList = await requestJson(
        baseUrl,
        "/arena/internal/rewards?payoutStatus=requested",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(requestedList.status, HttpStatus.OK);
      assert.equal(requestedList.body.totalCount, 1);
      assert.equal(requestedList.body.items.length, 1);
      assert.equal(requestedList.body.items[0].ledgerId, requestedLedger.id);
      assert.equal(requestedList.body.items[0].payoutStatus, "requested");
    });
  },
);

test(
  "internal reward complete route rejects approved wallet payouts that never recorded an execution transaction hash",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const ledger = await seedRewardLedger(
        harness,
        "http_reward_complete_missing_tx_user",
      );
      const operator = {
        userId: "operator_reward",
        roles: [SystemRole.Operator],
      };

      const approved = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/approve-payout`,
        {
          method: "POST",
          body: {
            approvedAt: arenaTime(46),
            reason: "operator_approved_reward_payout",
          },
          user: operator,
        },
      );
      assert.equal(approved.status, HttpStatus.CREATED);
      assert.equal(approved.body.payout.status, "approved");
      assert.equal(approved.body.payout.executionTxHash, null);

      const failedCompletion = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/complete-payout`,
        {
          method: "POST",
          body: {
            completedAt: arenaTime(47),
            reason: "wallet_transfer_confirmed",
            note: "attempted before any execution proof existed",
          },
          user: operator,
        },
      );

      assert.equal(failedCompletion.status, HttpStatus.CONFLICT);
      assert.equal(
        failedCompletion.body.error.code,
        "reward_payout.execution_tx_hash_required",
      );

      const detail = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}`,
        {
          method: "GET",
          user: operator,
        },
      );
      assert.equal(detail.status, HttpStatus.OK);
      assert.equal(detail.body.payout.status, "approved");
      assert.equal(detail.body.payout.executionTxHash, null);
      assert.equal(detail.body.payout.completedAt, null);
    });
  },
);

test(
  "internal reward list isolates finalized ledgers that are missing payout records",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const missingLedger = await seedRewardLedger(
        harness,
        "http_reward_missing_queue_user",
        {
          userOptions: {
            walletAddress: undefined,
          },
        },
      );
      const requestedLedger = await seedRewardLedger(
        harness,
        "http_reward_requested_queue_user",
      );

      const missingPayout = await harness.rewardPayoutRepository.findByLedgerId(
        missingLedger.id,
      );
      const requestedPayout = await harness.rewardPayoutRepository.findByLedgerId(
        requestedLedger.id,
      );
      assert.equal(missingPayout, null);
      assert.ok(requestedPayout);

      const response = await requestJson(
        baseUrl,
        "/arena/internal/rewards?status=finalized&missingPayoutOnly=true",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(response.body.totalCount, 1);
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.items[0].ledgerId, missingLedger.id);
      assert.equal(response.body.items[0].payoutId, null);
      assert.equal(response.body.items[0].payoutStatus, null);
    });
  },
);

test(
  "internal reward list isolates stale executing payouts that need operator recovery",
  async () => {
    const originalNow = Date.now;
    Date.now = () => Date.parse("2026-04-18T10:30:00.000Z");

    try {
      await withHttpArenaApp(async ({ baseUrl, harness }) => {
        const staleLedger = await seedRewardLedger(
          harness,
          "http_reward_stale_execution_user",
        );
        const freshLedger = await seedRewardLedger(
          harness,
          "http_reward_fresh_execution_user",
        );

        const stalePayout = await harness.rewardPayoutRepository.findByLedgerId(
          staleLedger.id,
        );
        const freshPayout = await harness.rewardPayoutRepository.findByLedgerId(
          freshLedger.id,
        );
        assert.ok(stalePayout);
        assert.ok(freshPayout);

        await harness.rewardPayoutService.approvePayout({
          payoutId: stalePayout.id,
          actorUserId: "operator_reward",
          approvedAt: arenaTime(2),
        });
        await harness.rewardPayoutService.startExecution({
          payoutId: stalePayout.id,
          startedAt: arenaTime(3),
        });

        await harness.rewardPayoutService.approvePayout({
          payoutId: freshPayout.id,
          actorUserId: "operator_reward",
          approvedAt: arenaTime(20),
        });
        await harness.rewardPayoutService.startExecution({
          payoutId: freshPayout.id,
          startedAt: arenaTime(21),
        });

        const response = await requestJson(
          baseUrl,
          "/arena/internal/rewards?staleExecutionOnly=true",
          {
            method: "GET",
            user: { userId: "operator_reward", roles: [SystemRole.Operator] },
          },
        );

        assert.equal(response.status, HttpStatus.OK);
        assert.equal(response.body.totalCount, 1);
        assert.equal(response.body.items.length, 1);
        assert.equal(response.body.items[0].ledgerId, staleLedger.id);
        assert.equal(response.body.items[0].payoutStatus, "executing");
        assert.equal(
          response.body.items[0].payoutExecutionStartedAt,
          arenaTime(3),
        );
      });
    } finally {
      Date.now = originalNow;
    }
  },
);

test(
  "internal reward list derives actionable payout queues for operators",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const missingLedger = await seedRewardLedger(
        harness,
        "http_reward_action_missing_user",
        {
          userOptions: {
            walletAddress: undefined,
          },
        },
      );
      const requestedLedger = await seedRewardLedger(
        harness,
        "http_reward_action_requested_user",
      );
      const failedLedger = await seedRewardLedger(
        harness,
        "http_reward_action_failed_user",
      );
      const executingLedger = await seedRewardLedger(
        harness,
        "http_reward_action_executing_user",
      );
      const confirmLedger = await seedRewardLedger(
        harness,
        "http_reward_action_confirm_user",
      );

      const failedPayout = await harness.rewardPayoutRepository.findByLedgerId(
        failedLedger.id,
      );
      const executingPayout = await harness.rewardPayoutRepository.findByLedgerId(
        executingLedger.id,
      );
      const confirmPayout = await harness.rewardPayoutRepository.findByLedgerId(
        confirmLedger.id,
      );
      assert.ok(failedPayout);
      assert.ok(executingPayout);
      assert.ok(confirmPayout);

      await harness.rewardPayoutService.approvePayout({
        payoutId: failedPayout.id,
        actorUserId: "operator_reward",
        approvedAt: arenaTime(6),
      });
      await harness.rewardPayoutService.failPayout({
        payoutId: failedPayout.id,
        failedAt: arenaTime(7),
        errorCode: "rpc_timeout",
        errorMessage: "RPC timeout during payout broadcast",
      });

      await harness.rewardPayoutService.approvePayout({
        payoutId: executingPayout.id,
        actorUserId: "operator_reward",
        approvedAt: arenaTime(8),
      });
      await harness.rewardPayoutService.startExecution({
        payoutId: executingPayout.id,
        startedAt: arenaTime(9),
      });
      await harness.rewardPayoutService.approvePayout({
        payoutId: confirmPayout.id,
        actorUserId: "operator_reward",
        approvedAt: arenaTime(10),
      });
      await harness.rewardPayoutService.executePayout({
        payoutId: confirmPayout.id,
        startedAt: arenaTime(11),
      });

      const missingQueue = await requestJson(
        baseUrl,
        "/arena/internal/rewards?actionQueue=missing_payout",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(missingQueue.status, HttpStatus.OK);
      assert.equal(missingQueue.body.totalCount, 1);
      assert.equal(missingQueue.body.items[0].ledgerId, missingLedger.id);

      const approvalQueue = await requestJson(
        baseUrl,
        "/arena/internal/rewards?actionQueue=approval",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(approvalQueue.status, HttpStatus.OK);
      assert.equal(approvalQueue.body.totalCount, 1);
      assert.equal(approvalQueue.body.items[0].ledgerId, requestedLedger.id);
      assert.equal(approvalQueue.body.items[0].payoutStatus, "requested");

      const retryQueue = await requestJson(
        baseUrl,
        "/arena/internal/rewards?actionQueue=retry",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(retryQueue.status, HttpStatus.OK);
      assert.equal(retryQueue.body.totalCount, 1);
      assert.equal(retryQueue.body.items[0].ledgerId, failedLedger.id);
      assert.equal(retryQueue.body.items[0].payoutStatus, "failed");

      const confirmQueue = await requestJson(
        baseUrl,
        "/arena/internal/rewards?actionQueue=execution_confirm",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(confirmQueue.status, HttpStatus.OK);
      assert.equal(confirmQueue.body.totalCount, 1);
      assert.equal(confirmQueue.body.items[0].ledgerId, confirmLedger.id);
      assert.equal(confirmQueue.body.items[0].payoutStatus, "executing");
      assert.equal(
        typeof confirmQueue.body.items[0].payoutExecutionTxHash,
        "string",
      );

      const recoverQueue = await requestJson(
        baseUrl,
        "/arena/internal/rewards?actionQueue=execution_recover",
        {
          method: "GET",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
        },
      );
      assert.equal(recoverQueue.status, HttpStatus.OK);
      assert.equal(recoverQueue.body.totalCount, 1);
      assert.equal(recoverQueue.body.items[0].ledgerId, executingLedger.id);
      assert.equal(recoverQueue.body.items[0].payoutStatus, "executing");
      assert.equal(recoverQueue.body.items[0].payoutExecutionTxHash, null);
    });
  },
);

test(
  "internal reward ensure payout route recreates a missing payout after wallet binding",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const ledger = await seedRewardLedger(
        harness,
        "http_reward_missing_payout_user",
        {
          userOptions: {
            walletAddress: undefined,
          },
        },
      );

      const payoutBeforeWallet = await harness.rewardPayoutRepository.findByLedgerId(
        ledger.id,
      );
      assert.equal(payoutBeforeWallet, null);

      await harness.userRepository.updatePrimaryWalletAddress(
        "http_reward_missing_payout_user",
        "0x00000000000000000000000000000000000000c4",
      );

      const ensured = await requestJson(
        baseUrl,
        `/arena/internal/rewards/${ledger.id}/ensure-payout`,
        {
          method: "POST",
          user: { userId: "operator_reward", roles: [SystemRole.Operator] },
          body: {
            ensuredAt: arenaTime(5),
            reason: "manual_missing_payout_recovery",
            note: "restore payout after wallet binding",
          },
        },
      );

      assert.equal(ensured.status, HttpStatus.CREATED);
      assert.equal(ensured.body.payout.status, "requested");
      assert.equal(
        ensured.body.payout.destinationAddress,
        "0x00000000000000000000000000000000000000c4",
      );
      assert.equal(ensured.body.auditEvents[0].action, "reward_payout_ensured");
      assert.equal(
        ensured.body.auditEvents[0].reason,
        "manual_missing_payout_recovery",
      );
    });
  },
);
