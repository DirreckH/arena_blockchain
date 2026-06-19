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

import { ArenaPublicController } from "../../src/arena/public.controller";
import { ArenaPublicDiscoveryController } from "../../src/arena/public-discovery.controller";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { DiscoveryConfigService } from "../../src/arena/services/discovery-config.service";
import { PublicIntegrityViewService } from "../../src/arena/services/public-integrity-view.service";
import { PublicDiscoveryService } from "../../src/arena/services/public-discovery.service";
import { PublicResultViewService } from "../../src/arena/services/public-result-view.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
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
  minEffectiveSample: 2,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  sampleConstraints: [] as string[],
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: true,
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

const settleProposition = async (
  harness: ArenaHarness,
  propositionId: string,
  marketId: string,
  txHash: string,
  settledAt: string,
) => {
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId,
    now: settledAt,
    updatedByUserId: "admin_1",
  });
  await harness.marketRepository.update(marketId, {
    resolutionTxHash: txHash,
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId,
    settledAt,
  });
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();
  const publicResultViews = new PublicResultViewService(
    harness.propositionRepository as any,
    harness.marketRepository as any,
    harness.counterRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
  );
  const validationViews = new ValidationViewService(
    harness.config as any,
    harness.propositionRepository as any,
    harness.counterRepository as any,
    harness.marketRepository as any,
    harness.betRepository as any,
  );
  const publicIntegrityViews = new PublicIntegrityViewService(
    harness.propositionRepository as any,
    harness.counterService as any,
    publicResultViews as any,
  );
  const publicDiscoveryService = new PublicDiscoveryService(
    validationViews as any,
  );

  @Module({
    controllers: [ArenaPublicController, ArenaPublicDiscoveryController],
    providers: [
      {
        provide: PublicResultViewService,
        useValue: publicResultViews,
      },
      {
        provide: EffectiveSampleCounterService,
        useValue: harness.counterService,
      },
      {
        provide: ValidationViewService,
        useValue: validationViews,
      },
      {
        provide: PublicIntegrityViewService,
        useValue: publicIntegrityViews,
      },
      {
        provide: PublicDiscoveryService,
        useValue: publicDiscoveryService,
      },
      {
        provide: DiscoveryConfigService,
        useValue: null,
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
  "public settled results HTTP route keeps public verification data without leaking internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const settledProposition = await createLiveProposition(harness, {
        title: "Public settled results HTTP proposition",
        category: "politics",
      });
      const liveProposition = await createLiveProposition(harness, {
        title: "Still live public results HTTP proposition",
        category: "sports",
      });
      const settledMarket = await harness.marketRepository.findByPropositionId(
        settledProposition.id,
      );
      assert.ok(settledMarket);

      await createReviewedResponseForProposition(harness, {
        propositionId: settledProposition.id,
        userId: "public_results_http_user_a",
        minuteOffset: 700,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: settledProposition.id,
        userId: "public_results_http_user_b",
        minuteOffset: 701,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: settledProposition.id,
        userId: "public_results_http_user_c",
        minuteOffset: 702,
        reviewStatus: "partial_valid",
      });
      await harness.counterService.rebuildCounterForProposition(
        settledProposition.id,
      );

      await harness.betService.placeBet({
        propositionId: settledProposition.id,
        marketId: settledMarket.id,
        userId: "public_results_http_bettor",
        selectedOption: 0,
        stakeAmount: "25",
        placedAt: arenaTime(703),
      });

      await settleProposition(
        harness,
        settledProposition.id,
        settledMarket.id,
        "0xpublicresults0000000000000000000000000000000000000000000000000001",
        arenaTime(704),
      );

      await createReviewedResponseForProposition(harness, {
        propositionId: liveProposition.id,
        userId: "public_results_http_live_user",
        minuteOffset: 705,
        reviewStatus: "valid",
      });
      await harness.counterService.rebuildCounterForProposition(liveProposition.id);

      const response = await requestJson(
        baseUrl,
        "/arena/public/results/settled",
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(response.body.totalCount, 1);
      assert.equal(response.body.items[0]?.propositionId, settledProposition.id);
      assert.equal(response.body.items[0]?.title, "Public settled results HTTP proposition");
      assert.equal(response.body.items[0]?.resultKind, "resolved");
      assert.equal(response.body.items[0]?.winningOption, 0);
      assert.equal(response.body.items[0]?.validSampleCount, 3);
      assert.equal(response.body.items.some(
        (item: { propositionId: string }) => item.propositionId === liveProposition.id,
      ), false);
      assertInternalIdentityAbsentRecursively(response.body);
    });
  },
);

test(
  "public market search HTTP route returns filtered public markets without leaking internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      await createLiveProposition(harness, {
        title: "Transit support search proposition",
        category: "politics",
        options: ["Support", "Oppose"],
      });
      await createLiveProposition(harness, {
        title: "Stadium atmosphere check",
        category: "sports",
        options: ["Loud", "Muted"],
      });

      const response = await requestJson(
        baseUrl,
        "/arena/public/markets/search?q=transit",
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(Array.isArray(response.body), true);
      assert.equal(response.body.length, 1);
      assert.equal(response.body[0]?.title, "Transit support search proposition");
      assert.equal(response.body[0]?.category, "politics");
      assert.equal("marketBias" in (response.body[0] ?? {}), false);
      assertInternalIdentityAbsentRecursively(response.body);
    });
  },
);

test(
  "public proposition progress HTTP route keeps progress visible without leaking internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const proposition = await createLiveProposition(harness, {
        title: "Public progress HTTP proposition",
        category: "politics",
        minEffectiveSample: 2,
      });

      await createReviewedResponseForProposition(harness, {
        propositionId: proposition.id,
        userId: "public_progress_http_user_a",
        minuteOffset: 710,
        reviewStatus: "valid",
      });
      await harness.counterService.rebuildCounterForProposition(proposition.id);

      const response = await requestJson(
        baseUrl,
        `/arena/public/propositions/${proposition.id}/progress`,
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(response.body.propositionId, proposition.id);
      assert.equal(response.body.title, "Public progress HTTP proposition");
      assert.equal(response.body.progress.totalRequired, 2);
      assert.equal(response.body.progress.currentEffectiveSample, 1);
      assert.equal(response.body.progress.reviewedCount, 1);
      assert.equal(response.body.progress.progressPercent, 50);
      assert.equal(response.body.publicState.phase, "live");
      assert.equal(response.body.publicState.reachedSampleThreshold, false);
      assert.equal(response.body.lastPublishedResult, null);
      assertInternalIdentityAbsentRecursively(response.body);
    });
  },
);

test(
  "public discovery HTTP routes keep home rankings latest topics and category directories free of internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const politics = await createLiveProposition(harness, {
        title: "Discovery politics proposition",
        category: "politics",
        minEffectiveSample: 2,
      });
      const sports = await createLiveProposition(harness, {
        title: "Discovery sports proposition",
        category: "sports",
        minEffectiveSample: 1,
      });
      const ai = await createLiveProposition(harness, {
        title: "Discovery ai proposition",
        category: "ai",
        minEffectiveSample: 3,
      });

      await createReviewedResponseForProposition(harness, {
        propositionId: politics.id,
        userId: "discovery_http_politics_user",
        minuteOffset: 730,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: sports.id,
        userId: "discovery_http_sports_user",
        minuteOffset: 731,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: ai.id,
        userId: "discovery_http_ai_user",
        minuteOffset: 732,
        reviewStatus: "partial_valid",
      });

      await harness.counterService.rebuildCounterForProposition(politics.id);
      await harness.counterService.rebuildCounterForProposition(sports.id);
      await harness.counterService.rebuildCounterForProposition(ai.id);

      const [
        homeResponse,
        hotResponse,
        latestTopicsResponse,
        categoryIndexResponse,
        politicsDirectoryResponse,
      ] = await Promise.all([
        requestJson(baseUrl, "/arena/public/discovery/home"),
        requestJson(baseUrl, "/arena/public/discovery/rankings/hot"),
        requestJson(baseUrl, "/arena/public/discovery/latest-topics"),
        requestJson(baseUrl, "/arena/public/discovery/categories"),
        requestJson(baseUrl, "/arena/public/discovery/categories/politics"),
      ]);

      assert.equal(homeResponse.status, HttpStatus.OK);
      assert.equal(hotResponse.status, HttpStatus.OK);
      assert.equal(latestTopicsResponse.status, HttpStatus.OK);
      assert.equal(categoryIndexResponse.status, HttpStatus.OK);
      assert.equal(politicsDirectoryResponse.status, HttpStatus.OK);

      assert.equal(homeResponse.body.featuredMarketIds.length >= 1, true);
      assert.equal(
        homeResponse.body.sections.some((section: { href: string }) => section.href === "/zh"),
        true,
      );
      assert.equal(
        hotResponse.body.items.some(
          (item: { title: string }) => item.title === "Discovery sports proposition",
        ),
        true,
      );
      assert.equal(latestTopicsResponse.body.items.some(
        (item: { id: string }) => item.id === "latest",
      ), true);
      assert.equal(
        categoryIndexResponse.body.items.some(
          (item: { slug: string; pathname: string }) =>
            item.slug === "politics" && item.pathname === "/zh/politics",
        ),
        true,
      );
      assert.equal(
        politicsDirectoryResponse.body.marketIds.includes(
          (await harness.marketRepository.findByPropositionId(politics.id))!.id,
        ),
        true,
      );

      for (const body of [
        homeResponse.body,
        hotResponse.body,
        latestTopicsResponse.body,
        categoryIndexResponse.body,
        politicsDirectoryResponse.body,
      ]) {
        assertInternalIdentityAbsentRecursively(body);
      }
    });
  },
);

test(
  "public discovery closing-soon HTTP route keeps urgent and upcoming buckets free of internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const now = new Date();
      const publishedAt = new Date(
        now.getTime() - 2 * 60 * 60 * 1000,
      ).toISOString();

      const createRecentLiveProposition = async (input: {
        title: string;
        category: "politics" | "sports" | "ai" | "general";
        maxDurationSeconds: number;
        liveOffsetMs: number;
      }) => {
        const draft = await harness.propositionEngineService.createProposition({
          ...propositionDraftInput,
          title: input.title,
          category: input.category,
          marketEnabled: true,
          minDurationSeconds: 300,
          maxDurationSeconds: input.maxDurationSeconds,
        });
        const scheduled =
          await harness.propositionEngineService.approveOrScheduleProposition({
            propositionId: draft.id,
            publishedAt,
            updatedByUserId: "admin_1",
          });

        return harness.propositionEngineService.publishLiveProposition({
          propositionId: scheduled.id,
          liveAt: new Date(now.getTime() + input.liveOffsetMs).toISOString(),
          updatedByUserId: "admin_1",
        });
      };

      await createRecentLiveProposition({
        title: "Identity urgent closing-soon proposition",
        category: "politics",
        maxDurationSeconds: 2 * 60 * 60,
        liveOffsetMs: -30 * 60 * 1000,
      });
      await createRecentLiveProposition({
        title: "Identity upcoming closing-soon proposition",
        category: "ai",
        maxDurationSeconds: 8 * 60 * 60,
        liveOffsetMs: 0,
      });

      const response = await requestJson(
        baseUrl,
        "/arena/public/discovery/closing-soon",
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(typeof response.body.generatedAt, "string");
      assert.equal(response.body.urgentWindowMs, 3 * 60 * 60 * 1000);
      assert.equal(Array.isArray(response.body.urgent), true);
      assert.equal(Array.isArray(response.body.upcoming), true);
      assert.equal(response.body.urgent.length >= 1, true);
      assert.equal(response.body.upcoming.length >= 1, true);
      assert.equal(response.body.urgent[0]?.differenceMs > 0, true);
      assert.equal(
        response.body.upcoming.every(
          (item: { differenceMs: number }) =>
            item.differenceMs > response.body.urgentWindowMs,
        ),
        true,
      );
      assertInternalIdentityAbsentRecursively(response.body);
    });
  },
);

test(
  "public integrity overview HTTP route keeps proposition focus visible without leaking internal user ids",
  async () => {
    await withHttpArenaApp(async ({ baseUrl, harness }) => {
      const collectingProposition = await createLiveProposition(harness, {
        title: "Public integrity collecting HTTP proposition",
        category: "ai",
        minEffectiveSample: 3,
      });
      const settledProposition = await createLiveProposition(harness, {
        title: "Public integrity settled HTTP proposition",
        category: "sports",
        minEffectiveSample: 2,
      });
      const settledMarket = await harness.marketRepository.findByPropositionId(
        settledProposition.id,
      );
      assert.ok(settledMarket);

      await createReviewedResponseForProposition(harness, {
        propositionId: collectingProposition.id,
        userId: "public_integrity_http_collecting_user",
        minuteOffset: 720,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: settledProposition.id,
        userId: "public_integrity_http_settled_user_a",
        minuteOffset: 721,
        reviewStatus: "valid",
      });
      await createReviewedResponseForProposition(harness, {
        propositionId: settledProposition.id,
        userId: "public_integrity_http_settled_user_b",
        minuteOffset: 722,
        reviewStatus: "valid",
      });
      await harness.counterService.rebuildCounterForProposition(
        collectingProposition.id,
      );
      await harness.counterService.rebuildCounterForProposition(
        settledProposition.id,
      );

      await harness.betService.placeBet({
        propositionId: settledProposition.id,
        marketId: settledMarket.id,
        userId: "public_integrity_http_bettor",
        selectedOption: 0,
        stakeAmount: "18",
        placedAt: arenaTime(723),
      });

      await settleProposition(
        harness,
        settledProposition.id,
        settledMarket.id,
        "0xpublicintegrity0000000000000000000000000000000000000000000000000001",
        arenaTime(724),
      );

      const response = await requestJson(
        baseUrl,
        `/arena/public/integrity/overview?propositionId=${settledProposition.id}`,
      );

      assert.equal(response.status, HttpStatus.OK);
      assert.equal(typeof response.body.generatedAt, "string");
      assert.equal(response.body.live.totalCount, 1);
      assert.equal(response.body.archive.settledCount, 1);
      assert.equal(response.body.focus.propositionId, settledProposition.id);
      assert.equal(response.body.focus.visible, true);
      assert.equal(response.body.focus.source, "archive");
      assert.equal(response.body.focus.archiveItem.propositionId, settledProposition.id);
      assert.equal(response.body.focus.liveItem, null);
      assert.equal("operatorActions" in response.body, false);
      assertInternalIdentityAbsentRecursively(response.body);
    });
  },
);
