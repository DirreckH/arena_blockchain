import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { SystemRole } from "@arena/shared";

import { ArenaInternalResponsesController } from "../../src/arena/internal-responses.controller";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { InternalResponseReviewOpsService } from "../../src/arena/services/internal-response-review-ops.service";
import { QualityEngineService } from "../../src/arena/services/quality-engine.service";
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
    method?: "GET";
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

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers,
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

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaInternalResponsesController],
    providers: [
      {
        provide: InternalResponseReviewOpsService,
        useValue: harness.internalResponseReviewOpsService,
      },
      {
        provide: QualityEngineService,
        useValue: harness.qualityEngineService,
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
        provide: Reflector,
        useValue: new Reflector(),
      },
    ],
  })
  class TestArenaHttpModule {}

  const app = await NestFactory.create(TestArenaHttpModule, {
    logger: false,
  });
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

test("internal responses queue route lists proposition-scoped stale claims with workflow metadata", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const first = await createLiveProposition(harness, {
      title: "First response queue proposition",
    });
    const second = await createLiveProposition(harness, {
      title: "Second response queue proposition",
    });

    const firstTask = await harness.dispatchTaskService.assignTask({
      propositionId: first.id,
      userId: "respondent_stale",
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    const secondTask = await harness.dispatchTaskService.assignTask({
      propositionId: second.id,
      userId: "respondent_other",
      assignedAt: "2026-04-18T10:07:00.000Z",
      expiresAt: "2026-04-18T10:17:00.000Z",
    });

    const firstResponse = await harness.responseService.submitResponse({
      propositionId: first.id,
      taskId: firstTask.id,
      userId: "respondent_stale",
      responsePayload: {
        confidence: 0.9,
        rationale: "Operator queue should surface this stale claim.",
      },
      selectedOption: 0,
      confirmationOption: 0,
      understandingAck: true,
      clientStartedAt: "2026-04-18T10:06:10.000Z",
      clientSubmittedAt: "2026-04-18T10:06:40.000Z",
      submittedAt: "2026-04-18T10:06:45.000Z",
    });
    await harness.responseService.submitResponse({
      propositionId: second.id,
      taskId: secondTask.id,
      userId: "respondent_other",
      responsePayload: {
        confidence: 0.2,
        rationale: "Second item stays out after proposition filter.",
      },
      selectedOption: 1,
      confirmationOption: 1,
      understandingAck: true,
      clientStartedAt: "2026-04-18T10:07:05.000Z",
      clientSubmittedAt: "2026-04-18T10:07:35.000Z",
      submittedAt: "2026-04-18T10:07:40.000Z",
    });

    await harness.qualityEngineService.claimPendingResponseReview({
      responseId: firstResponse.id,
      claimedAt: "2026-04-18T10:07:00.000Z",
      claimedByUserId: "operator_alpha",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/responses?propositionId=${first.id}&claimStaleOnly=true&claimedByUserId=operator_alpha&workflowState=expired&limit=5`,
      {
        user: {
          userId: "ops_1",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.totalCount, 1);
    assert.equal(response.body.limit, 5);
    assert.equal(response.body.offset, 0);
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0]?.responseId, firstResponse.id);
    assert.equal(response.body.items[0]?.propositionId, first.id);
    assert.equal(
      response.body.items[0]?.propositionTitle,
      "First response queue proposition",
    );
    assert.equal(response.body.items[0]?.workflowState, "expired");
    assert.equal(response.body.items[0]?.claimedByUserId, "operator_alpha");
    assert.equal(response.body.items[0]?.isClaimStale, true);
  });
});

test("internal responses queue route supports search sort and offset pagination", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const alpha = await createLiveProposition(harness, {
      title: "Alpha response proposition",
    });
    const beta = await createLiveProposition(harness, {
      title: "Beta response proposition",
    });

    const alphaTask = await harness.dispatchTaskService.assignTask({
      propositionId: alpha.id,
      userId: "respondent_alpha",
      assignedAt: "2026-04-18T10:06:00.000Z",
      expiresAt: "2026-04-18T10:16:00.000Z",
    });
    const betaTask = await harness.dispatchTaskService.assignTask({
      propositionId: beta.id,
      userId: "respondent_beta",
      assignedAt: "2026-04-18T10:07:00.000Z",
      expiresAt: "2026-04-18T10:17:00.000Z",
    });

    await harness.responseService.submitResponse({
      propositionId: alpha.id,
      taskId: alphaTask.id,
      userId: "respondent_alpha",
      responsePayload: {
        confidence: 0.8,
        rationale: "Alpha search should match this response.",
      },
      selectedOption: 0,
      confirmationOption: 0,
      understandingAck: true,
      clientStartedAt: "2026-04-18T10:06:05.000Z",
      clientSubmittedAt: "2026-04-18T10:06:20.000Z",
      submittedAt: "2026-04-18T10:06:25.000Z",
    });
    const betaResponse = await harness.responseService.submitResponse({
      propositionId: beta.id,
      taskId: betaTask.id,
      userId: "respondent_beta",
      responsePayload: {
        confidence: 0.7,
        rationale: "Alpha search also matches the proposition title here.",
      },
      selectedOption: 1,
      confirmationOption: 1,
      understandingAck: true,
      clientStartedAt: "2026-04-18T10:07:05.000Z",
      clientSubmittedAt: "2026-04-18T10:07:20.000Z",
      submittedAt: "2026-04-18T10:07:25.000Z",
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/responses?search=alpha&sortBy=submittedAt&sortDirection=asc&limit=1&offset=1",
      {
        user: {
          userId: "ops_3",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.totalCount, 2);
    assert.equal(response.body.limit, 1);
    assert.equal(response.body.offset, 1);
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0]?.responseId, betaResponse.id);
    assert.equal(
      response.body.items[0]?.propositionTitle,
      "Beta response proposition",
    );
  });
});

test("internal response detail route exposes operator review context without manual regrade fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const proposition = await createLiveProposition(harness, {
      title: "Detail proposition",
    });
    const task = await harness.dispatchTaskService.assignTask({
      propositionId: proposition.id,
      userId: "detail_user",
      assignedAt: "2026-04-18T10:08:00.000Z",
      expiresAt: "2026-04-18T10:18:00.000Z",
    });

    const responseRecord = await harness.responseService.submitResponse({
      propositionId: proposition.id,
      taskId: task.id,
      userId: "detail_user",
      responsePayload: {
        confidence: 0.66,
        rationale: "Detail view should include proposition and task context.",
      },
      selectedOption: 1,
      confirmationOption: 1,
      understandingAck: true,
      clientStartedAt: "2026-04-18T10:08:05.000Z",
      clientSubmittedAt: "2026-04-18T10:08:20.000Z",
      submittedAt: "2026-04-18T10:08:25.000Z",
    });

    await harness.qualityEngineService.reviewPendingResponse({
      responseId: responseRecord.id,
      reviewedAt: "2026-04-18T10:09:00.000Z",
      reviewedByUserId: "reviewer_1",
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/responses/${responseRecord.id}`,
      {
        user: {
          userId: "ops_2",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.response.id, responseRecord.id);
    assert.equal(response.body.proposition.id, proposition.id);
    assert.equal(response.body.proposition.title, "Detail proposition");
    assert.equal(response.body.task.id, task.id);
    assert.equal(response.body.workflow.workflowState, "finalized");
    assert.equal(response.body.currentReview.status !== "pending_review", true);
    assert.equal(response.body.response.userId, "detail_user");
    assert.equal(response.body.response.selectedOption, 1);
  });
});
