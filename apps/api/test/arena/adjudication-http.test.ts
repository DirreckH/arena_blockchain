import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  INestApplication,
  Module,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { PinoLogger } from "nestjs-pino";

import { ArenaAdjudicationController } from "../../src/arena/adjudication.controller";
import { AdjudicationViewService } from "../../src/arena/services/adjudication-view.service";
import { DispatchEngineService } from "../../src/arena/services/dispatch-engine.service";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { ResponseService } from "../../src/arena/services/response.service";
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

class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userIdHeader = request.headers["x-test-user-id"];
    if (typeof userIdHeader !== "string" || userIdHeader.trim().length === 0) {
      throw new UnauthorizedException("Authentication required");
    }

    request.user = {
      sub: userIdHeader.trim(),
      walletAddress: `wallet_${userIdHeader.trim()}`,
      chainId: 1,
      roles: undefined,
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

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.UTC(2026, 3, 18, 10, minuteOffset, secondOffset, 0),
  ).toISOString();

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();
  const adjudicationViews = new AdjudicationViewService(
    harness.propositionRepository as any,
    harness.dispatchTaskRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
    harness.rewardLedgerRepository as any,
  );
  const logger: Pick<PinoLogger, "setContext" | "warn" | "error"> = {
    setContext() {},
    warn() {},
    error() {},
  };

  @Module({
    controllers: [ArenaAdjudicationController],
    providers: [
      {
        provide: AdjudicationViewService,
        useValue: adjudicationViews,
      },
      {
        provide: DispatchEngineService,
        useValue: harness.dispatchEngineService,
      },
      {
        provide: ResponseService,
        useValue: harness.responseService,
      },
      {
        provide: EffectiveSampleCounterService,
        useValue: harness.counterService,
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

test("respondent can start an assigned adjudication task", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Start route proposition",
    });
    const task = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_start_owner",
      assignedAt: arenaTime(1),
      expiresAt: arenaTime(61),
    });

    const response = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${task.id}/start`,
      {
        method: "POST",
        user: {
          userId: "respondent_start_owner",
        },
        body: {
          startedAt: arenaTime(2),
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.taskId, task.id);
    assert.equal(response.body.taskStatus, "started");
    assert.equal(response.body.startedAt, arenaTime(2));
    assert.equal(response.body.assignedAt, arenaTime(1));
  });
});

test("start route rejects non-owner, expired, and non-assigned tasks", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Start route conflict proposition",
    });
    const ownerTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_start_owner_2",
      assignedAt: arenaTime(10),
      expiresAt: arenaTime(70),
    });

    const ownerMismatch = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${ownerTask.id}/start`,
      {
        method: "POST",
        user: {
          userId: "respondent_start_other",
        },
        body: {
          startedAt: arenaTime(11),
        },
      },
    );
    assert.equal(ownerMismatch.status, HttpStatus.CONFLICT);
    assert.equal(
      ownerMismatch.body.error.code,
      "dispatch_task.owner_mismatch",
    );

    const expiredTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_start_owner_3",
      assignedAt: arenaTime(20),
      expiresAt: arenaTime(21),
    });

    const expired = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${expiredTask.id}/start`,
      {
        method: "POST",
        user: {
          userId: "respondent_start_owner_3",
        },
        body: {
          startedAt: arenaTime(22),
        },
      },
    );
    assert.equal(expired.status, HttpStatus.CONFLICT);
    assert.equal(expired.body.error.code, "dispatch_task.start_after_expiry");

    const startedTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_start_owner_4",
      assignedAt: arenaTime(30),
      expiresAt: arenaTime(90),
    });
    await harness.dispatchTaskService.startTask({
      taskId: startedTask.id,
      userId: "respondent_start_owner_4",
      startedAt: arenaTime(31),
    });

    const invalidState = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${startedTask.id}/start`,
      {
        method: "POST",
        user: {
          userId: "respondent_start_owner_4",
        },
        body: {
          startedAt: arenaTime(32),
        },
      },
    );
    assert.equal(invalidState.status, HttpStatus.CONFLICT);
    assert.equal(
      invalidState.body.error.code,
      "ARENA_INVALID_STATE_TRANSITION",
    );
  });
});

test("respondent can skip an assigned or started adjudication task with cooldown metadata", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Skip route proposition",
    });
    const task = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_skip_owner",
      assignedAt: arenaTime(40),
      expiresAt: arenaTime(100),
    });
    await harness.dispatchTaskService.startTask({
      taskId: task.id,
      userId: "respondent_skip_owner",
      startedAt: arenaTime(41),
    });

    const skippedAt = arenaTime(42);
    const response = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${task.id}/skip`,
      {
        method: "POST",
        user: {
          userId: "respondent_skip_owner",
        },
        body: {
          skippedAt,
          skipReason: "user_declined",
        },
      },
    );

    assert.equal(response.status, HttpStatus.CREATED);
    assert.equal(response.body.taskStatus, "skipped");
    assert.equal(response.body.skipReason, "user_declined");
    assert.equal(
      response.body.cooldownUntil,
      new Date(new Date(skippedAt).getTime() + 12 * 60 * 60 * 1000).toISOString(),
    );
  });
});

test("skip route rejects non-owner and terminal tasks", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Skip route conflict proposition",
    });
    const ownerTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_skip_owner_2",
      assignedAt: arenaTime(50),
      expiresAt: arenaTime(110),
    });

    const ownerMismatch = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${ownerTask.id}/skip`,
      {
        method: "POST",
        user: {
          userId: "respondent_skip_other",
        },
        body: {
          skippedAt: arenaTime(51),
          skipReason: "user_declined",
        },
      },
    );
    assert.equal(ownerMismatch.status, HttpStatus.CONFLICT);
    assert.equal(
      ownerMismatch.body.error.code,
      "dispatch_task.owner_mismatch",
    );

    const submittedTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_skip_owner_3",
      assignedAt: arenaTime(60),
      expiresAt: arenaTime(120),
    });
    await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: submittedTask.id,
      userId: "respondent_skip_owner_3",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: arenaTime(61),
      clientSubmittedAt: arenaTime(62),
      understandingAck: true,
      submittedAt: arenaTime(62),
    });

    const submitted = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${submittedTask.id}/skip`,
      {
        method: "POST",
        user: {
          userId: "respondent_skip_owner_3",
        },
        body: {
          skippedAt: arenaTime(63),
          skipReason: "user_declined",
        },
      },
    );
    assert.equal(submitted.status, HttpStatus.CONFLICT);
    assert.equal(
      submitted.body.error.code,
      "ARENA_INVALID_STATE_TRANSITION",
    );

    const expiredTask = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "respondent_skip_owner_4",
      assignedAt: arenaTime(70),
      expiresAt: arenaTime(80),
    });
    await harness.dispatchTaskService.expireTask({
      taskId: expiredTask.id,
      expiredAt: arenaTime(80),
      expiryReason: "ttl_elapsed",
    });

    const expired = await requestJson(
      baseUrl,
      `/arena/adjudication/tasks/${expiredTask.id}/skip`,
      {
        method: "POST",
        user: {
          userId: "respondent_skip_owner_4",
        },
        body: {
          skippedAt: arenaTime(81),
          skipReason: "user_declined",
        },
      },
    );
    assert.equal(expired.status, HttpStatus.CONFLICT);
    assert.equal(
      expired.body.error.code,
      "ARENA_INVALID_STATE_TRANSITION",
    );
  });
});

test(
  "adjudication self surfaces keep task and submission views free of internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const userId = "respondent_identity_owner";
      const listedProposition = await createLiveProposition(harness, {
        title: "Adjudication identity regression listed proposition",
      });
      const listedTask = await harness.dispatchTaskService.assignTask({
        propositionId: listedProposition.id,
        userId,
        assignedAt: arenaTime(90),
        expiresAt: arenaTime(150),
      });
      const startedProposition = await createLiveProposition(harness, {
        title: "Adjudication identity regression started proposition",
      });
      const startedTask = await harness.dispatchTaskService.assignTask({
        propositionId: startedProposition.id,
        userId,
        assignedAt: arenaTime(91),
        expiresAt: arenaTime(151),
      });
      const skippedProposition = await createLiveProposition(harness, {
        title: "Adjudication identity regression skipped proposition",
      });
      const skippedTask = await harness.dispatchTaskService.assignTask({
        propositionId: skippedProposition.id,
        userId,
        assignedAt: arenaTime(92),
        expiresAt: arenaTime(152),
      });
      const submittedProposition = await createLiveProposition(harness, {
        title: "Adjudication identity regression submitted proposition",
      });
      const submittedTask = await harness.dispatchTaskService.assignTask({
        propositionId: submittedProposition.id,
        userId,
        assignedAt: arenaTime(93),
        expiresAt: arenaTime(153),
      });

      const listResponse = await requestJson(baseUrl, "/arena/adjudication/tasks", {
        user: { userId },
      });
      const detailResponse = await requestJson(
        baseUrl,
        `/arena/adjudication/tasks/${listedTask.id}`,
        {
          user: { userId },
        },
      );
      const startResponse = await requestJson(
        baseUrl,
        `/arena/adjudication/tasks/${startedTask.id}/start`,
        {
          method: "POST",
          user: { userId },
          body: {
            startedAt: arenaTime(94),
          },
        },
      );
      const skipResponse = await requestJson(
        baseUrl,
        `/arena/adjudication/tasks/${skippedTask.id}/skip`,
        {
          method: "POST",
          user: { userId },
          body: {
            skippedAt: arenaTime(95),
            skipReason: "user_declined",
          },
        },
      );
      const submitResponse = await requestJson(
        baseUrl,
        `/arena/adjudication/tasks/${submittedTask.id}/responses`,
        {
          method: "POST",
          user: { userId },
          body: {
            propositionId: submittedProposition.id,
            selectedOption: 0,
            confirmationOption: 0,
            clientStartedAt: arenaTime(96),
            clientSubmittedAt: arenaTime(97),
            understandingAck: true,
            submittedAt: arenaTime(97),
          },
        },
      );
      const submittedDetailResponse = await requestJson(
        baseUrl,
        `/arena/adjudication/tasks/${submittedTask.id}`,
        {
          user: { userId },
        },
      );

      assert.equal(listResponse.status, HttpStatus.OK);
      assert.equal(detailResponse.status, HttpStatus.OK);
      assert.equal(startResponse.status, HttpStatus.CREATED);
      assert.equal(skipResponse.status, HttpStatus.CREATED);
      assert.equal(submitResponse.status, HttpStatus.CREATED);
      assert.equal(submittedDetailResponse.status, HttpStatus.OK);

      assert.equal(Array.isArray(listResponse.body), true);
      assert.equal(
        listResponse.body.some(
          (item: { taskId: string }) => item.taskId === listedTask.id,
        ),
        true,
      );
      assert.equal(detailResponse.body.taskId, listedTask.id);
      assert.equal(startResponse.body.taskId, startedTask.id);
      assert.equal(startResponse.body.taskStatus, "started");
      assert.equal(skipResponse.body.taskId, skippedTask.id);
      assert.equal(skipResponse.body.taskStatus, "skipped");
      assert.equal(typeof submitResponse.body.responseId, "string");
      assert.equal(submitResponse.body.taskView.taskId, submittedTask.id);
      assert.equal(submitResponse.body.taskView.taskStatus, "submitted");
      assert.equal(submittedDetailResponse.body.taskId, submittedTask.id);
      assert.equal(submittedDetailResponse.body.taskStatus, "submitted");

      for (const body of [
        listResponse.body,
        detailResponse.body,
        startResponse.body,
        skipResponse.body,
        submitResponse.body,
        submittedDetailResponse.body,
      ]) {
        assertInternalIdentityAbsentRecursively(body);
      }
    });
  },
);
