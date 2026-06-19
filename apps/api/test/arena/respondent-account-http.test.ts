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

import { SystemRole } from "@arena/shared";

import { ArenaRespondentAccountController } from "../../src/arena/respondent-account.controller";
import { ArenaRespondentReputationController } from "../../src/arena/respondent-reputation.controller";
import { ArenaRespondentResultsController } from "../../src/arena/respondent-results.controller";
import { ArenaRespondentTagsController } from "../../src/arena/respondent-tags.controller";
import { AccountExportService } from "../../src/arena/services/account-export.service";
import { AccountPreferencesService } from "../../src/arena/services/account-preferences.service";
import { AccountViewService } from "../../src/arena/services/account-view.service";
import { ReputationService } from "../../src/arena/services/reputation.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { TagService } from "../../src/arena/services/tag.service";
import { WatchlistService } from "../../src/arena/services/watchlist.service";
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
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    user: TestUser;
    body?: unknown;
  },
): Promise<JsonResponse> => {
  const headers = new Headers({
    accept: "application/json",
    "x-test-user-id": input.user.userId,
  });

  if (input.user.roles && input.user.roles.length > 0) {
    headers.set("x-test-roles", input.user.roles.join(","));
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
    controllers: [
      ArenaRespondentAccountController,
      ArenaRespondentResultsController,
      ArenaRespondentReputationController,
      ArenaRespondentTagsController,
    ],
    providers: [
      {
        provide: AccountViewService,
        useValue: harness.accountViewService,
      },
      {
        provide: AccountPreferencesService,
        useValue: harness.accountPreferencesService,
      },
      {
        provide: WatchlistService,
        useValue: harness.watchlistService,
      },
      {
        provide: AccountExportService,
        useValue: harness.accountExportService,
      },
      {
        provide: ResultViewService,
        useValue: harness.resultViewService,
      },
      {
        provide: ReputationService,
        useValue: harness.reputationService,
      },
      {
        provide: TagService,
        useValue: harness.tagService,
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
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
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

test("self-facing respondent account endpoints hide redundant userId fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const userId = "respondent_http_self";
    await harness.userIdentityService.ensureUserExists(userId);
    await harness.userRepository.updatePrimaryWalletAddress(
      userId,
      "0x1234567890abcdef1234567890abcdef1234abcd",
    );

    const settled = await createLiveProposition(harness, {
      marketEnabled: true,
      category: "ai",
      title: "Respondent account settled proposition",
    });
    const settledMarket = await harness.marketRepository.findByPropositionId(
      settled.id,
    );
    assert.ok(settledMarket);

    await createReviewedResponseForProposition(harness, {
      propositionId: settled.id,
      userId,
      minuteOffset: 10,
      reviewStatus: "valid",
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: settledMarket.id,
      userId,
      selectedOption: 0,
      stakeAmount: "25",
      placedAt: arenaTime(11),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(12),
      updatedByUserId: "admin_1",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(13),
    });

    const open = await createLiveProposition(harness, {
      marketEnabled: true,
      category: "sports",
      title: "Respondent account open proposition",
    });
    const openMarket = await harness.marketRepository.findByPropositionId(open.id);
    assert.ok(openMarket);
    await harness.betService.placeBet({
      propositionId: open.id,
      marketId: openMarket.id,
      userId,
      selectedOption: 1,
      stakeAmount: "40",
      placedAt: arenaTime(14),
    });
    await harness.counterService.rebuildCounterForProposition(open.id);

    const prefsResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/preferences",
      {
        method: "PATCH",
        user: { userId, roles: [SystemRole.User] },
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
      },
    );

    assert.equal(prefsResponse.status, HttpStatus.OK);

    const watchSaveResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/watchlist",
      {
        method: "POST",
        user: { userId, roles: [SystemRole.User] },
        body: {
          marketId: openMarket.id,
        },
      },
    );
    assert.equal(watchSaveResponse.status, HttpStatus.CREATED);

    const exportCreateResponse = await requestJson(
      baseUrl,
      "/arena/adjudication/account/exports",
      {
        method: "POST",
        user: { userId, roles: [SystemRole.User] },
        body: {},
      },
    );
    assert.equal(exportCreateResponse.status, HttpStatus.CREATED);

    const [
      overviewResponse,
      preferencesResponse,
      exportsResponse,
      exportDetailResponse,
      watchlistResponse,
      resultsResponse,
      resultDetailResponse,
      resultOverviewResponse,
      reputationResponse,
      tagsResponse,
    ] = await Promise.all([
      requestJson(baseUrl, "/arena/adjudication/account/overview", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/account/preferences", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/account/exports", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        `/arena/adjudication/account/exports/${exportCreateResponse.body.exportId}`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(baseUrl, "/arena/adjudication/account/watchlist", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/results", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, `/arena/adjudication/results/${settled.id}`, {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/results/overview", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/reputation", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/adjudication/tags", {
        user: { userId, roles: [SystemRole.User] },
      }),
    ]);

    const watchDeleteResponse = await requestJson(
      baseUrl,
      `/arena/adjudication/account/watchlist/${openMarket.id}`,
      {
        method: "DELETE",
        user: { userId, roles: [SystemRole.User] },
      },
    );

    assert.equal(overviewResponse.status, HttpStatus.OK);
    assert.equal(preferencesResponse.status, HttpStatus.OK);
    assert.equal(exportsResponse.status, HttpStatus.OK);
    assert.equal(exportDetailResponse.status, HttpStatus.OK);
    assert.equal(watchlistResponse.status, HttpStatus.OK);
    assert.equal(watchDeleteResponse.status, HttpStatus.OK);
    assert.equal(resultsResponse.status, HttpStatus.OK);
    assert.equal(resultDetailResponse.status, HttpStatus.OK);
    assert.equal(resultOverviewResponse.status, HttpStatus.OK);
    assert.equal(reputationResponse.status, HttpStatus.OK);
    assert.equal(tagsResponse.status, HttpStatus.OK);

    assertInternalIdentityAbsentRecursively(overviewResponse.body);
    assertInternalIdentityAbsentRecursively(preferencesResponse.body);
    assertInternalIdentityAbsentRecursively(exportsResponse.body);
    assertInternalIdentityAbsentRecursively(exportDetailResponse.body);
    assertInternalIdentityAbsentRecursively(watchlistResponse.body);
    assertInternalIdentityAbsentRecursively(watchSaveResponse.body);
    assertInternalIdentityAbsentRecursively(watchDeleteResponse.body);
    assertInternalIdentityAbsentRecursively(resultsResponse.body);
    assertInternalIdentityAbsentRecursively(resultDetailResponse.body);
    assertInternalIdentityAbsentRecursively(resultOverviewResponse.body);
    assertInternalIdentityAbsentRecursively(reputationResponse.body);
    assertInternalIdentityAbsentRecursively(tagsResponse.body);
  });
});
