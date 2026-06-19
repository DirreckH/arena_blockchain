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
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";

import { ArenaDiscussionController } from "../../src/arena/discussion.controller";
import { DiscussionService } from "../../src/arena/services/discussion.service";
import { IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
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

type TestUser = {
  userId: string;
};

type JsonResponse = {
  status: number;
  body: any;
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
    request.requestId = request.requestId ?? "test-request-id";
    request.traceId = request.traceId ?? "test-trace-id";

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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

const createSettledDiscussionMarket = async (harness: ArenaHarness) => {
  const proposition = await createLiveProposition(harness, {
    title: "Discussion HTTP identity proposition",
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_http_user_1",
    minuteOffset: 301,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_http_user_2",
    minuteOffset: 302,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_http_user_3",
    minuteOffset: 303,
    reviewStatus: "valid",
  });

  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "discussion_http_bettor",
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

  return { proposition, market };
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaDiscussionController],
    providers: [
      {
        provide: DiscussionService,
        useValue: harness.discussionService,
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
  "discussion HTTP routes expose wallet-derived public identity without leaking internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const { proposition, market } = await createSettledDiscussionMarket(harness);

      await harness.userRepository.create({
        id: "discussion_http_author",
        primaryWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        normalizedPrimaryWalletAddress:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "active",
      });

      const created = await requestJson(
        baseUrl,
        `/arena/discussion/markets/${market.id}/comments`,
        {
          method: "POST",
          user: {
            userId: "discussion_http_author",
          },
          body: {
            propositionId: proposition.id,
            body: "HTTP settled comment",
            optionIndex: 0,
            createdAt: arenaTime(306),
          },
        },
      );

      assert.equal(created.status, HttpStatus.CREATED);
      assert.equal(created.body.availability, "settled");
      assert.equal(created.body.totalCount, 1);
      assert.equal(created.body.comments[0]?.author, "Arena aaaa");
      assert.equal(created.body.comments[0]?.handle, "@aaaaaaaaaa");
      assert.equal(
        Object.prototype.hasOwnProperty.call(created.body.comments[0], "userId"),
        false,
      );
      assertInternalIdentityAbsentRecursively(created.body);

      const fetched = await requestJson(
        baseUrl,
        `/arena/discussion/markets/${market.id}`,
        {
          user: {
            userId: "discussion_http_author",
          },
        },
      );

      assert.equal(fetched.status, HttpStatus.OK);
      assert.equal(fetched.body.availability, "settled");
      assert.equal(fetched.body.comments[0]?.author, "Arena aaaa");
      assert.equal(fetched.body.comments[0]?.handle, "@aaaaaaaaaa");
      assert.equal(
        Object.prototype.hasOwnProperty.call(fetched.body.comments[0], "userId"),
        false,
      );
      assertInternalIdentityAbsentRecursively(fetched.body);
    });
  },
);
