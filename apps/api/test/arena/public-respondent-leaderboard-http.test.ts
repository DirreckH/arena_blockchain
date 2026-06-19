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

import { ArenaPublicRespondentLeaderboardController } from "../../src/arena/public-respondent-leaderboard.controller";
import { PublicRespondentLeaderboardService } from "../../src/arena/services/public-respondent-leaderboard.service";
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
): Promise<JsonResponse> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: new Headers({
      accept: "application/json",
    }),
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

const createLeaderboardService = (harness: ArenaHarness) =>
  new PublicRespondentLeaderboardService(
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

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaPublicRespondentLeaderboardController],
    providers: [
      {
        provide: PublicRespondentLeaderboardService,
        useValue: createLeaderboardService(harness),
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

test(
  "public respondent leaderboard HTTP route keeps only wallet-backed public identities and never exposes user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const proposition = await createLiveProposition(harness, {
        marketEnabled: true,
        minEffectiveSample: 2,
        title: "Leaderboard HTTP identity proposition",
        category: "politics",
      });

      const unboundUserId = "leaderboard_http_unbound_user";
      await createReviewedResponseForProposition(harness, {
        propositionId: proposition.id,
        userId: unboundUserId,
        minuteOffset: 610,
        reviewStatus: "valid",
      });
      const unboundDefaults =
        await harness.accountPreferencesService.getAccountPreferencesForUser(
          unboundUserId,
        );
      await harness.accountPreferencesService.updateAccountPreferencesForUser(
        unboundUserId,
        {
          ...unboundDefaults,
          profile: {
            ...unboundDefaults.profile,
            profileVisibility: "public",
          },
          privacy: {
            ...unboundDefaults.privacy,
            allowActivityIndexing: true,
          },
        },
      );

      const legacyWalletUser = "0xdddddddddddddddddddddddddddddddddddddddd";
      await createReviewedResponseForProposition(harness, {
        propositionId: proposition.id,
        userId: legacyWalletUser,
        minuteOffset: 620,
        reviewStatus: "valid",
      });
      const legacyDefaults =
        await harness.accountPreferencesService.getAccountPreferencesForUser(
          legacyWalletUser,
        );
      await harness.accountPreferencesService.updateAccountPreferencesForUser(
        legacyWalletUser,
        {
          ...legacyDefaults,
          profile: {
            ...legacyDefaults.profile,
            profileVisibility: "public",
          },
          privacy: {
            ...legacyDefaults.privacy,
            allowActivityIndexing: true,
          },
        },
      );

      const response = await requestJson(
        baseUrl,
        "/arena/public/discovery/respondent-leaderboard",
      );

      assert.equal(response.status, HttpStatus.OK);
      const politicsCategory = response.body.categories.find(
        (category: { id: string }) => category.id === "public-policy",
      );
      assert.ok(politicsCategory);
      assert.equal(politicsCategory.rows.length, 1);
      assert.equal(politicsCategory.rows[0]?.walletShort, "0xdddd…dddd");
      assert.equal(politicsCategory.rows[0]?.handle, "respondent-dddd");
      assert.equal(
        Object.prototype.hasOwnProperty.call(politicsCategory.rows[0], "userId"),
        false,
      );
    });
  },
);
