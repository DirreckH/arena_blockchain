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
} from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";

import { SystemRole } from "@arena/shared";

import { ArenaRespondentRewardsController } from "../../src/arena/respondent-rewards.controller";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ArenaSurfaceBoundaryGuard } from "../../src/common/guards/arena-surface-boundary.guard";
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
  minEffectiveSample: 1,
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

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userIdHeader = request.headers["x-test-user-id"];
    if (typeof userIdHeader !== "string" || userIdHeader.trim().length === 0) {
      throw new UnauthorizedException("Authentication required");
    }

    const rolesHeader = request.headers["x-test-roles"];
    const roles =
      typeof rolesHeader === "string" && rolesHeader.trim().length > 0
        ? (rolesHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value): value is SystemRole => value.length > 0) as SystemRole[])
        : [SystemRole.User];

    request.user = {
      sub: userIdHeader.trim(),
      walletAddress: `wallet_${userIdHeader.trim()}`,
      chainId: 1,
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
    user: TestUser;
  },
): Promise<JsonResponse> => {
  const headers = new Headers({
    accept: "application/json",
    "x-test-user-id": input.user.userId,
  });

  if (input.user.roles && input.user.roles.length > 0) {
    headers.set("x-test-roles", input.user.roles.join(","));
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers,
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
    reviewStatus: "valid" | "partial_valid";
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

  await harness.responseReviewService.reviewPartialValid({
    responseId: response.id,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: 60,
    flags: ["attention_mismatch"],
    reasonCodes: ["attention_mismatch"],
  });
  return response;
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaRespondentRewardsController],
    providers: [
      {
        provide: RewardViewService,
        useValue: new RewardViewService(
          harness.propositionRepository as any,
          harness.rewardLedgerService as any,
          harness.rewardPayoutService as any,
        ),
      },
      {
        provide: Reflector,
        useValue: new Reflector(),
      },
      {
        provide: APP_GUARD,
        useClass: TestAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: ArenaSurfaceBoundaryGuard,
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

test("self-facing respondent rewards route hides redundant userId fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const userId = "respondent_rewards_http_self";
    const settled = await createLiveProposition(harness, {
      marketEnabled: false,
      category: "ai",
      title: "Respondent rewards settled proposition",
    });

    await createReviewedResponseForProposition(harness, {
      propositionId: settled.id,
      userId,
      minuteOffset: 10,
      reviewStatus: "valid",
    });

    const response = await requestJson(
      baseUrl,
      "/arena/adjudication/rewards",
      {
        user: { userId, roles: [SystemRole.User] },
      },
    );

    assert.equal(response.status, HttpStatus.OK);
    assert.equal(Array.isArray(response.body), true);
    assert.equal(response.body.length, 1);
    assertInternalIdentityAbsentRecursively(response.body);
    assert.equal(response.body[0]?.payoutDestinationAddress, null);
  });
});
