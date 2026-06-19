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

import { ArenaPropositionsController } from "../../src/arena/propositions.controller";
import { ArenaSurfaceBoundaryGuard } from "../../src/common/guards/arena-surface-boundary.guard";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import type { ArenaHarness } from "./harness";
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

const assertNoForbiddenKeys = (
  value: unknown,
  forbiddenKeys: readonly string[],
  path = "$",
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, forbiddenKeys, `${path}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  for (const forbiddenKey of forbiddenKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(record, forbiddenKey),
      false,
      `${path} unexpectedly exposes ${forbiddenKey}`,
    );
  }

  for (const [key, nested] of Object.entries(record)) {
    assertNoForbiddenKeys(nested, forbiddenKeys, `${path}.${key}`);
  }
};

type HttpArenaContext = {
  app: INestApplication;
  baseUrl: string;
  harness: ArenaHarness;
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
  const logger: Pick<PinoLogger, "setContext" | "warn" | "error"> = {
    setContext() {},
    warn() {},
    error() {},
  };

  @Module({
    controllers: [ArenaPropositionsController],
    providers: [
      {
        provide: Reflector,
        useValue: new Reflector(),
      },
      {
        provide: "PropositionDraftService",
        useValue: harness.propositionDraftService,
      },
      {
        provide: harness.propositionDraftService.constructor,
        useValue: harness.propositionDraftService,
      },
      {
        provide: harness.requesterPropositionViewService.constructor,
        useValue: harness.requesterPropositionViewService,
      },
      {
        provide: harness.requesterReportPresetService.constructor,
        useValue: harness.requesterReportPresetService,
      },
      {
        provide: harness.requesterComparisonSetService.constructor,
        useValue: harness.requesterComparisonSetService,
      },
      {
        provide: harness.requesterComparisonSetDeliveryPolicyService.constructor,
        useValue: harness.requesterComparisonSetDeliveryPolicyService,
      },
      {
        provide: harness.requesterComparisonSetDeliveryTransportService.constructor,
        useValue: harness.requesterComparisonSetDeliveryTransportService,
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
        useClass: ArenaSurfaceBoundaryGuard,
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

test("self-facing requester mine endpoints hide redundant userId fields", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const userId = "requester_http_self";
    const forbiddenSelfSurfaceKeys = [
      "userId",
      "createdByUserId",
      "updatedByUserId",
      "submittedByUserId",
      "reviewedByUserId",
    ] as const;

    const settled = await createLiveProposition(harness, {
      title: "Requester account settled proposition",
      createdByUserId: userId,
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "ai",
    });
    await createReviewedResponseForProposition(harness, {
      propositionId: settled.id,
      userId: "requester_http_self_participant",
      minuteOffset: 10,
      reviewStatus: "valid",
    });
    await harness.counterService.rebuildCounterForProposition(settled.id);
    const settledMarket = await harness.marketRepository.findByPropositionId(
      settled.id,
    );
    assert.ok(settledMarket);
    await harness.betService.placeBet({
      propositionId: settled.id,
      marketId: settledMarket.id,
      userId: "requester_http_self_trader",
      selectedOption: 0,
      stakeAmount: "22",
      placedAt: arenaTime(11),
    });
    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: settled.id,
      now: arenaTime(12),
      updatedByUserId: "operator_requester_http_self",
    });
    await harness.validationSettlementService.settleValidationMarket({
      propositionId: settled.id,
      settledAt: arenaTime(13),
    });

    const open = await createLiveProposition(harness, {
      title: "Requester account open proposition",
      createdByUserId: userId,
      marketEnabled: true,
      minEffectiveSample: 1,
      category: "sports",
    });
    await harness.counterService.rebuildCounterForProposition(open.id);
    const openMarket = await harness.marketRepository.findByPropositionId(open.id);
    assert.ok(openMarket);
    await harness.betService.placeBet({
      propositionId: open.id,
      marketId: openMarket.id,
      userId: "requester_http_self_trader_open",
      selectedOption: 1,
      stakeAmount: "35",
      placedAt: arenaTime(14),
    });

    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      userId,
      {
        name: "Requester self preset",
        windowDays: 30,
        categories: ["ai", "sports"],
        marketEnabledOnly: false,
        statusScope: "all",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        userId,
        {
          name: "Requester self comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        userId,
        comparisonSet.comparisonSetId,
        {
          name: "Requester self delivery policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: "https://example.test/requester-self-surface",
            credentialKey: "delivery_policy",
          },
        },
      );

    const propositionExport =
      await harness.requesterPropositionViewService.createOwnedPropositionExport({
        userId,
      });
    const comparisonExport =
      await harness.requesterPropositionViewService.createOwnedComparisonSetExport({
        userId,
        comparisonSetId: comparisonSet.comparisonSetId,
      });
    await harness.requesterComparisonSetDeliveryRunService.createRunRecord({
      userId,
      comparisonSetId: comparisonSet.comparisonSetId,
      policyId: policy.policyId,
      triggerType: "manual",
      status: "completed",
      startedAt: "2026-04-18T12:00:00.000Z",
      completedAt: "2026-04-18T12:00:05.000Z",
      exportId: comparisonExport.exportId,
      retainedExportAvailable: true,
      origin: {
        type: "delivery_policy_manual",
        policyId: policy.policyId,
        policyName: policy.name,
      },
      delivery: null,
      error: null,
    });
    const retryableFailedRun =
      await harness.requesterComparisonSetDeliveryRunService.createRunRecord({
        userId,
        comparisonSetId: comparisonSet.comparisonSetId,
        policyId: policy.policyId,
        triggerType: "manual",
        status: "failed",
        startedAt: arenaTime(17),
        completedAt: arenaTime(17, 15),
        exportId: comparisonExport.exportId,
        retainedExportAvailable: true,
        origin: {
          type: "delivery_policy_manual",
          policyId: policy.policyId,
          policyName: policy.name,
        },
        delivery: null,
        error: {
          code: "requester_comparison_set_delivery.transport_failed",
          message: "Requester comparison set delivery transport failed with status 500",
        },
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "https://example.test/requester-self-surface") {
        return new Response(null, {
          status: HttpStatus.ACCEPTED,
        });
      }

      return originalFetch(input as Parameters<typeof fetch>[0], init);
    };

    try {
      const [
      propositionListResponse,
      overviewResponse,
      analyticsResponse,
      analyticsCompareResponse,
      propositionExportListResponse,
      propositionExportDetailResponse,
      propositionDetailResponse,
      propositionReportResponse,
      propositionBudgetLedgerResponse,
      presetListResponse,
      presetDetailResponse,
      comparisonSetListResponse,
      comparisonSetDetailResponse,
      comparisonAnalyticsResponse,
      comparisonExportListResponse,
      comparisonExportDetailResponse,
      deliveryCredentialListResponse,
      deliveryPolicyListResponse,
      deliveryPolicyHealthResponse,
    ] = await Promise.all([
      requestJson(baseUrl, "/arena/propositions/mine", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, "/arena/propositions/mine/overview", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        "/arena/propositions/mine/analytics?windowDays=30&now=2026-04-18T12:00:00.000Z",
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/analytics/compare?presetIds=${preset.presetId}&now=2026-04-18T12:00:00.000Z`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(baseUrl, "/arena/propositions/mine/exports", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/exports/${propositionExport.exportId}`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(baseUrl, `/arena/propositions/mine/${settled.id}`, {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(baseUrl, `/arena/propositions/mine/${settled.id}/report`, {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/${settled.id}/budget-ledger`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(baseUrl, "/arena/propositions/mine/report-presets", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/report-presets/${preset.presetId}`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(baseUrl, "/arena/propositions/mine/comparison-sets", {
        user: { userId, roles: [SystemRole.User] },
      }),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/analytics?now=2026-04-18T12:00:00.000Z`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/exports/${comparisonExport.exportId}`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        "/arena/propositions/mine/delivery-credentials",
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
      requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/health?now=2026-04-18T12:00:00.000Z`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      ),
    ]);

      const deliveryPolicyRunResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/run`,
        {
          method: "POST",
          user: { userId, roles: [SystemRole.User] },
        },
      );
      const deliveryPolicyRetryResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs/${retryableFailedRun.runId}/retry`,
        {
          method: "POST",
          user: { userId, roles: [SystemRole.User] },
        },
      );
      const deliveryRunListResponse = await requestJson(
        baseUrl,
        `/arena/propositions/mine/comparison-sets/${comparisonSet.comparisonSetId}/delivery-policies/${policy.policyId}/runs`,
        {
          user: { userId, roles: [SystemRole.User] },
        },
      );

      assert.equal(propositionListResponse.status, HttpStatus.OK);
      assert.equal(overviewResponse.status, HttpStatus.OK);
      assert.equal(analyticsResponse.status, HttpStatus.OK);
      assert.equal(analyticsCompareResponse.status, HttpStatus.OK);
      assert.equal(propositionExportListResponse.status, HttpStatus.OK);
      assert.equal(propositionExportDetailResponse.status, HttpStatus.OK);
      assert.equal(propositionDetailResponse.status, HttpStatus.OK);
      assert.equal(propositionReportResponse.status, HttpStatus.OK);
      assert.equal(propositionBudgetLedgerResponse.status, HttpStatus.OK);
      assert.equal(presetListResponse.status, HttpStatus.OK);
      assert.equal(presetDetailResponse.status, HttpStatus.OK);
      assert.equal(comparisonSetListResponse.status, HttpStatus.OK);
      assert.equal(comparisonSetDetailResponse.status, HttpStatus.OK);
      assert.equal(comparisonAnalyticsResponse.status, HttpStatus.OK);
      assert.equal(comparisonExportListResponse.status, HttpStatus.OK);
      assert.equal(comparisonExportDetailResponse.status, HttpStatus.OK);
      assert.equal(deliveryCredentialListResponse.status, HttpStatus.OK);
      assert.equal(deliveryPolicyListResponse.status, HttpStatus.OK);
      assert.equal(deliveryPolicyHealthResponse.status, HttpStatus.OK);
      assert.equal(deliveryPolicyRunResponse.status, HttpStatus.CREATED);
      assert.equal(deliveryRunListResponse.status, HttpStatus.OK);
      assert.equal(deliveryPolicyRetryResponse.status, HttpStatus.CREATED);

      assertNoForbiddenKeys(propositionListResponse.body, forbiddenSelfSurfaceKeys);
      assertNoForbiddenKeys(overviewResponse.body, forbiddenSelfSurfaceKeys);
      assertNoForbiddenKeys(analyticsResponse.body, forbiddenSelfSurfaceKeys);
      assertNoForbiddenKeys(
        analyticsCompareResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        propositionExportListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        propositionExportDetailResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        propositionDetailResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        propositionReportResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        propositionBudgetLedgerResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(presetListResponse.body, forbiddenSelfSurfaceKeys);
      assertNoForbiddenKeys(presetDetailResponse.body, forbiddenSelfSurfaceKeys);
      assertNoForbiddenKeys(
        comparisonSetListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        comparisonSetDetailResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        comparisonAnalyticsResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        comparisonExportListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        comparisonExportDetailResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryCredentialListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryPolicyListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryPolicyHealthResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryPolicyRunResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryRunListResponse.body,
        forbiddenSelfSurfaceKeys,
      );
      assertNoForbiddenKeys(
        deliveryPolicyRetryResponse.body,
        forbiddenSelfSurfaceKeys,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("requester mine detail ownership failures stay structured instead of surfacing as generic 500s", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const ownerUserId = "requester_http_owner";
    const otherUserId = "requester_http_other";
    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      ownerUserId,
      {
        name: "Owner only preset",
        windowDays: 14,
        categories: ["ai"],
        marketEnabledOnly: false,
        statusScope: "all",
        defaultExportFormat: "json",
      },
    );

    const response = await requestJson(
      baseUrl,
      `/arena/propositions/mine/report-presets/${preset.presetId}`,
      {
        user: { userId: otherUserId, roles: [SystemRole.User] },
      },
    );

    assert.equal(response.status, HttpStatus.NOT_FOUND);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "requester_report_preset.not_found");
    assert.match(
      response.body.error.message,
      /Requester report preset .* was not found$/,
    );
    assert.equal(response.body.path, `/arena/propositions/mine/report-presets/${preset.presetId}`);
  });
});
