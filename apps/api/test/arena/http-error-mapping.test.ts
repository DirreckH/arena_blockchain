import "reflect-metadata";

import assert from "node:assert/strict";
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

import { ArenaAdjudicationController } from "../../src/arena/adjudication.controller";
import { ArenaInternalPropositionsController } from "../../src/arena/internal-propositions.controller";
import { ArenaInternalValidationChainController } from "../../src/arena/internal-validation-chain.controller";
import { ArenaPublicController } from "../../src/arena/public.controller";
import { ArenaPropositionsController } from "../../src/arena/propositions.controller";
import { ArenaRespondentAccountController } from "../../src/arena/respondent-account.controller";
import { ArenaRespondentResultsController } from "../../src/arena/respondent-results.controller";
import { ArenaValidationController } from "../../src/arena/validation.controller";
import { Public } from "../../src/common/decorators/public.decorator";
import { IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { AdjudicationViewService } from "../../src/arena/services/adjudication-view.service";
import { AccountViewService } from "../../src/arena/services/account-view.service";
import { AccountExportService } from "../../src/arena/services/account-export.service";
import { AccountPreferencesService } from "../../src/arena/services/account-preferences.service";
import { BetService } from "../../src/arena/services/bet.service";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { InternalPropositionOpsService } from "../../src/arena/services/internal-proposition-ops.service";
import { PropositionDraftService } from "../../src/arena/services/proposition-draft.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ResponseService } from "../../src/arena/services/response.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
import { WatchlistService } from "../../src/arena/services/watchlist.service";
import { ValidationChainOperatorCommandService } from "../../src/arena/validation-chain/validation-chain-operator-command.service";
import { ValidationChainOracleService } from "../../src/arena/validation-chain/validation-chain-oracle.service";
import { ValidationChainPauserService } from "../../src/arena/validation-chain/validation-chain-pauser.service";
import { ValidationChainContractError } from "../../src/arena/validation-chain/validation-chain.types";
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
    const roles =
      typeof rolesHeader === "string" && rolesHeader.trim().length > 0
        ? (rolesHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value): value is SystemRole => value.length > 0) as SystemRole[])
        : undefined;

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
    async createMarket() {
      return {
        propositionId: "stub",
        marketId: "stub",
        chainPropositionId: "stub",
        chainMarketId: "stub",
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
    async freezeMarket() {
      return {
        propositionId: "stub",
        marketId: "stub",
        chainPropositionId: "stub",
        chainMarketId: "stub",
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
    async resolveMarket() {
      return {
        propositionId: "stub",
        marketId: "stub",
        chainPropositionId: "stub",
        chainMarketId: "stub",
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

  @Module({
    controllers: [
      ArenaInternalPropositionsController,
      ArenaInternalValidationChainController,
      ArenaPropositionsController,
      ArenaAdjudicationController,
      ArenaRespondentAccountController,
      ArenaRespondentResultsController,
      ArenaValidationController,
      ArenaPublicController,
      TestErrorController,
    ],
    providers: [
      { provide: PinoLogger, useValue: logger },
      { provide: InternalPropositionOpsService, useValue: harness.internalPropositionOpsService },
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
      { provide: PropositionDraftService, useValue: harness.propositionDraftService },
      { provide: ResponseService, useValue: harness.responseService },
      { provide: EffectiveSampleCounterService, useValue: harness.counterService },
      { provide: BetService, useValue: harness.betService },
      { provide: AdjudicationViewService, useValue: adjudicationViews },
      { provide: AccountViewService, useValue: accountViews },
      { provide: AccountExportService, useValue: harness.accountExportService },
      { provide: AccountPreferencesService, useValue: harness.accountPreferencesService },
      { provide: WatchlistService, useValue: harness.watchlistService },
      { provide: ResultViewService, useValue: resultViews },
      { provide: ValidationViewService, useValue: validationViews },
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

const requestJson = async (
  baseUrl: string,
  path: string,
  input: {
    method?: "DELETE" | "GET" | "PATCH" | "POST";
    body?: unknown;
    user?: TestUser;
  } = {},
): Promise<JsonResponse> => {
  const headers = new Headers({
    accept: "application/json",
  });

  if (input.user) {
    headers.set("x-test-user-id", input.user.userId);
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
      `/arena/validation/markets/${market.id}/bets`,
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
    assert.equal(createResponse.body.userId, "export_http_user");
    assert.equal(createResponse.body.status, "completed");
    assert.equal(createResponse.body.format, "json");
    assert.equal(createResponse.body.period, "90d");
    assert.equal(createResponse.body.fileName.endsWith(".json"), true);
    assert.equal(createResponse.body.walletAddress.includes("..."), true);

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
    assert.equal(internalQueueResponse.body.length, 1);
    assert.equal(internalQueueResponse.body[0].propositionId, propositionId);
    assert.equal(internalQueueResponse.body[0].submissionStatus, "submitted");
    assert.equal(typeof internalQueueResponse.body[0].submittedAt, "string");

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
    assert.equal(queueResponse.body.length >= 2, true);
    assert.equal(queueResponse.body[0].submissionStatus, "submitted");
    assert.equal(queueResponse.body[1].submissionStatus, "submitted");

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
      queueAfterDraftResponse.body.some(
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
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
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
          userId: "operator_1",
          roles: [SystemRole.Operator],
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
