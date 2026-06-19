import "reflect-metadata";

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
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
import { SystemRole } from "@arena/shared";
import { PinoLogger } from "nestjs-pino";

import { ArenaAdjudicationController } from "../../src/arena/adjudication.controller";
import { ArenaInternalMonitoringController } from "../../src/arena/internal-monitoring.controller";
import { ArenaValidationController } from "../../src/arena/validation.controller";
import { AdjudicationViewService } from "../../src/arena/services/adjudication-view.service";
import { DispatchEngineService } from "../../src/arena/services/dispatch-engine.service";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { ResponseService } from "../../src/arena/services/response.service";
import { ValidationBetExecutionService } from "../../src/arena/services/validation-bet-execution.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
import { AuthController } from "../../src/auth/auth.controller";
import { AuthService } from "../../src/auth/auth.service";
import {
  ARENA_RATE_LIMIT_KEY,
  type ArenaRateLimitBucket,
  type ArenaResolvedRateLimitPolicy,
} from "../../src/common/decorators/arena-rate-limit.decorator";
import { IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter";
import { ArenaRateLimitGuard } from "../../src/common/guards/arena-rate-limit.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { AppConfigService } from "../../src/config/app-config.service";
import { RedisService } from "../../src/queue/redis.service";

type TestUser = {
  userId: string;
  chainId?: number;
  roles?: SystemRole[];
  clientIp?: string;
};

type JsonResponse = {
  status: number;
  body: any;
  headers: Headers;
};

type HttpContext = {
  app: INestApplication;
  baseUrl: string;
  redis: FakeRedisService;
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
    return true;
  }
}

class FakeRedisService {
  private readonly counters = new Map<
    string,
    { count: number; expiresAtMs: number }
  >();

  reset(): void {
    this.counters.clear();
  }

  async incrementWindowCounter(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    const nowMs = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) {
      this.counters.set(key, {
        count: 1,
        expiresAtMs: nowMs + ttlSeconds * 1000,
      });
      return {
        count: 1,
        ttlSeconds,
      };
    }

    existing.count += 1;
    return {
      count: existing.count,
      ttlSeconds: Math.max(
        Math.ceil((existing.expiresAtMs - nowMs) / 1000),
        1,
      ),
    };
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
    if (typeof input.user.clientIp === "string") {
      headers.set("x-forwarded-for", input.user.clientIp);
    }
  }

  if (!input.user?.clientIp && typeof input.body === "object" && input.body !== null) {
    headers.set("x-forwarded-for", "203.0.113.10");
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
    headers: response.headers,
  };
};

const createRateLimitHttpApp = async (): Promise<HttpContext> => {
  const logger: Pick<PinoLogger, "setContext" | "warn" | "error"> = {
    setContext() {},
    warn() {},
    error() {},
  };
  const redis = new FakeRedisService();
  const config: Pick<AppConfigService, "resolveArenaRateLimit"> = {
    resolveArenaRateLimit(bucket: ArenaRateLimitBucket): ArenaResolvedRateLimitPolicy {
      const policies: Record<ArenaRateLimitBucket, ArenaResolvedRateLimitPolicy> = {
        auth_challenge: {
          bucket: "auth_challenge",
          keyStrategy: "client",
          limit: 1,
          windowSeconds: 60,
        },
        auth_verify: {
          bucket: "auth_verify",
          keyStrategy: "client",
          limit: 1,
          windowSeconds: 60,
        },
        adjudication_response_submit: {
          bucket: "adjudication_response_submit",
          keyStrategy: "user",
          limit: 1,
          windowSeconds: 60,
        },
        validation_bet_prepare: {
          bucket: "validation_bet_prepare",
          keyStrategy: "user",
          limit: 1,
          windowSeconds: 60,
        },
        validation_bet_confirm: {
          bucket: "validation_bet_confirm",
          keyStrategy: "user",
          limit: 1,
          windowSeconds: 60,
        },
        internal: {
          bucket: "internal",
          keyStrategy: "user",
          limit: 1,
          windowSeconds: 60,
        },
      };

      return policies[bucket];
    },
  };
  const authService = {
    async createChallenge(walletAddress: string, chainId: number) {
      return {
        walletAddress,
        chainId,
        challenge: "sign-this-message",
        expiresAt: "2026-06-07T00:00:00.000Z",
      };
    },
    async verifySignature(walletAddress: string, chainId: number) {
      return {
        accessToken: "test-token",
        identity: {
          sub: `user_${walletAddress.slice(-4)}`,
          walletAddress,
          chainId,
          roles: [],
        },
      };
    },
  };
  const adjudicationViews = {
    async listTasksForUser() {
      return [];
    },
    async getTaskForUser(taskId: string, userId: string) {
      return {
        taskId,
        userId,
        taskStatus: "assigned",
      };
    },
  };
  const dispatchEngine = {
    async startTask() {
      throw new Error("not used");
    },
    async skipTask() {
      throw new Error("not used");
    },
  };
  const responseService = {
    async submitResponse() {
      return {
        id: "response_1",
      };
    },
  };
  const counterService = {
    async rebuildCounterForProposition() {},
  };
  const validationViews = {
    async listMarkets() {
      return [];
    },
    async getMarket() {
      return {
        marketId: "market_1",
      };
    },
  };
  const betExecution = {
    async prepare(input: { marketId: string }) {
      return {
        marketId: input.marketId,
        requestStatus: "prepared",
      };
    },
    async confirm(input: { marketId: string; txHash: string }) {
      return {
        marketId: input.marketId,
        txHash: input.txHash,
        requestStatus: "accepted",
      };
    },
  };
  const monitoring = {
    async listSampleShortage() {
      return [];
    },
    async listQualityAnomalies() {
      return [];
    },
    async listValidationLifecycleDrift() {
      return [];
    },
    async getValidationChainHealth() {
      return null;
    },
    async getValidationChainRuntimeReadiness() {
      return null;
    },
    async getRuntimeContract() {
      return {
        status: "ok",
      };
    },
  };

  @Module({
    controllers: [
      AuthController,
      ArenaAdjudicationController,
      ArenaValidationController,
      ArenaInternalMonitoringController,
    ],
    providers: [
      {
        provide: AuthService,
        useValue: authService,
      },
      {
        provide: AdjudicationViewService,
        useValue: adjudicationViews,
      },
      {
        provide: DispatchEngineService,
        useValue: dispatchEngine,
      },
      {
        provide: ResponseService,
        useValue: responseService,
      },
      {
        provide: EffectiveSampleCounterService,
        useValue: counterService,
      },
      {
        provide: ValidationViewService,
        useValue: validationViews,
      },
      {
        provide: ValidationBetExecutionService,
        useValue: betExecution,
      },
      {
        provide: InternalMonitoringService,
        useValue: monitoring,
      },
      {
        provide: AppConfigService,
        useValue: config,
      },
      {
        provide: RedisService,
        useValue: redis,
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
        provide: APP_GUARD,
        useClass: ArenaRateLimitGuard,
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
  class TestArenaRateLimitModule {}

  const app = await NestFactory.create(TestArenaRateLimitModule, {
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

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    redis,
  };
};

let httpContext: HttpContext | null = null;

before(async () => {
  httpContext = await createRateLimitHttpApp();
});

beforeEach(() => {
  httpContext?.redis.reset();
});

after(async () => {
  if (!httpContext) {
    return;
  }

  await httpContext.app.close();
  httpContext = null;
});

const getHttpContext = (): HttpContext => {
  assert.ok(httpContext, "HTTP test app not initialized");
  return httpContext;
};

test("high-risk routes declare explicit rate-limit metadata", { concurrency: false }, () => {
  assert.deepEqual(
    Reflect.getMetadata(
      ARENA_RATE_LIMIT_KEY,
      AuthController.prototype.createChallenge,
    ),
    { bucket: "auth_challenge" },
  );
  assert.deepEqual(
    Reflect.getMetadata(
      ARENA_RATE_LIMIT_KEY,
      AuthController.prototype.verifySignature,
    ),
    { bucket: "auth_verify" },
  );
  assert.deepEqual(
    Reflect.getMetadata(
      ARENA_RATE_LIMIT_KEY,
      ArenaAdjudicationController.prototype.submitResponse,
    ),
    { bucket: "adjudication_response_submit" },
  );
  assert.deepEqual(
    Reflect.getMetadata(
      ARENA_RATE_LIMIT_KEY,
      ArenaValidationController.prototype.prepareBet,
    ),
    { bucket: "validation_bet_prepare" },
  );
  assert.deepEqual(
    Reflect.getMetadata(
      ARENA_RATE_LIMIT_KEY,
      ArenaValidationController.prototype.confirmBet,
    ),
    { bucket: "validation_bet_confirm" },
  );
});

test(
  "auth challenge and verify use independent client buckets and expose 429 envelopes",
  { concurrency: false },
  async () => {
    const { baseUrl } = getHttpContext();
    const challengeBody = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 1,
    };
    const verifyBody = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 1,
      signature: `0x${"11".repeat(32)}`,
    };

    const firstChallenge = await requestJson(baseUrl, "/auth/challenge", {
      method: "POST",
      user: {
        userId: "public_client",
        clientIp: "203.0.113.40",
      },
      body: challengeBody,
    });
    assert.equal(firstChallenge.status, HttpStatus.CREATED);

    const secondChallenge = await requestJson(baseUrl, "/auth/challenge", {
      method: "POST",
      user: {
        userId: "public_client",
        clientIp: "203.0.113.40",
      },
      body: challengeBody,
    });
    assert.equal(secondChallenge.status, HttpStatus.TOO_MANY_REQUESTS);
    assert.equal(secondChallenge.body.error.code, "TOO_MANY_REQUESTS");
    assert.equal(
      secondChallenge.body.error.message,
      "Too many requests for this action. Please retry later.",
    );
    assert.equal(secondChallenge.body.error.details.limit, 1);
    assert.equal(secondChallenge.body.error.details.windowSeconds, 60);
    assert.equal(secondChallenge.headers.get("retry-after"), "60");

    const firstVerify = await requestJson(baseUrl, "/auth/verify", {
      method: "POST",
      user: {
        userId: "public_client",
        clientIp: "203.0.113.40",
      },
      body: verifyBody,
    });
    assert.equal(firstVerify.status, HttpStatus.CREATED);

    const secondVerify = await requestJson(baseUrl, "/auth/verify", {
      method: "POST",
      user: {
        userId: "public_client",
        clientIp: "203.0.113.40",
      },
      body: verifyBody,
    });
    assert.equal(secondVerify.status, HttpStatus.TOO_MANY_REQUESTS);
  },
);

test(
  "adjudication response submission rate limits by user identity rather than shared client IP",
  { concurrency: false },
  async () => {
    const { baseUrl } = getHttpContext();
    const responseBody = {
      propositionId: "prop_1",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-06-07T01:00:00.000Z",
      clientSubmittedAt: "2026-06-07T01:01:00.000Z",
      understandingAck: true,
      submittedAt: "2026-06-07T01:01:00.000Z",
    };

    const firstSubmission = await requestJson(
      baseUrl,
      "/arena/adjudication/tasks/task_1/responses",
      {
        method: "POST",
        user: {
          userId: "respondent_alpha",
          clientIp: "203.0.113.41",
        },
        body: responseBody,
      },
    );
    assert.equal(firstSubmission.status, HttpStatus.CREATED);

    const secondSubmission = await requestJson(
      baseUrl,
      "/arena/adjudication/tasks/task_1/responses",
      {
        method: "POST",
        user: {
          userId: "respondent_alpha",
          clientIp: "203.0.113.41",
        },
        body: responseBody,
      },
    );
    assert.equal(secondSubmission.status, HttpStatus.TOO_MANY_REQUESTS);

    const otherUserSubmission = await requestJson(
      baseUrl,
      "/arena/adjudication/tasks/task_1/responses",
      {
        method: "POST",
        user: {
          userId: "respondent_beta",
          clientIp: "203.0.113.41",
        },
        body: responseBody,
      },
    );
    assert.equal(otherUserSubmission.status, HttpStatus.CREATED);
  },
);

test(
  "validation prepare and confirm use independent user-scoped buckets",
  { concurrency: false },
  async () => {
    const { baseUrl } = getHttpContext();
    const prepareBody = {
      propositionId: "prop_2",
      selectedOption: 1,
      stakeAmount: "25",
      placedAt: "2026-06-07T02:00:00.000Z",
    };
    const confirmBody = {
      propositionId: "prop_2",
      selectedOption: 1,
      stakeAmount: "25",
      placedAt: "2026-06-07T02:00:00.000Z",
      txHash: `0x${"12".repeat(32)}`,
    };

    const firstPrepare = await requestJson(
      baseUrl,
      "/arena/validation/markets/market_1/bets/prepare",
      {
        method: "POST",
        user: {
          userId: "validator_alpha",
          chainId: 1,
          clientIp: "203.0.113.42",
        },
        body: prepareBody,
      },
    );
    assert.equal(firstPrepare.status, HttpStatus.CREATED);

    const secondPrepare = await requestJson(
      baseUrl,
      "/arena/validation/markets/market_1/bets/prepare",
      {
        method: "POST",
        user: {
          userId: "validator_alpha",
          chainId: 1,
          clientIp: "203.0.113.42",
        },
        body: prepareBody,
      },
    );
    assert.equal(secondPrepare.status, HttpStatus.TOO_MANY_REQUESTS);

    const firstConfirm = await requestJson(
      baseUrl,
      "/arena/validation/markets/market_1/bets/confirm",
      {
        method: "POST",
        user: {
          userId: "validator_alpha",
          chainId: 1,
          clientIp: "203.0.113.42",
        },
        body: confirmBody,
      },
    );
    assert.equal(firstConfirm.status, HttpStatus.CREATED);

    const secondConfirm = await requestJson(
      baseUrl,
      "/arena/validation/markets/market_1/bets/confirm",
      {
        method: "POST",
        user: {
          userId: "validator_alpha",
          chainId: 1,
          clientIp: "203.0.113.42",
        },
        body: confirmBody,
      },
    );
    assert.equal(secondConfirm.status, HttpStatus.TOO_MANY_REQUESTS);

    const otherUserPrepare = await requestJson(
      baseUrl,
      "/arena/validation/markets/market_1/bets/prepare",
      {
        method: "POST",
        user: {
          userId: "validator_beta",
          chainId: 1,
          clientIp: "203.0.113.42",
        },
        body: prepareBody,
      },
    );
    assert.equal(otherUserPrepare.status, HttpStatus.CREATED);
  },
);

test(
  "internal arena routes inherit default rate limiting from the internal surface boundary",
  { concurrency: false },
  async () => {
    const { baseUrl } = getHttpContext();
    const firstRequest = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/runtime-contract",
      {
        user: {
          userId: "operator_alpha",
          roles: [SystemRole.Operator],
          clientIp: "203.0.113.43",
        },
      },
    );
    assert.equal(firstRequest.status, HttpStatus.OK);

    const secondRequest = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/runtime-contract",
      {
        user: {
          userId: "operator_alpha",
          roles: [SystemRole.Operator],
          clientIp: "203.0.113.43",
        },
      },
    );
    assert.equal(secondRequest.status, HttpStatus.TOO_MANY_REQUESTS);

    const otherOperatorRequest = await requestJson(
      baseUrl,
      "/arena/internal/monitoring/runtime-contract",
      {
        user: {
          userId: "operator_beta",
          roles: [SystemRole.Operator],
          clientIp: "203.0.113.43",
        },
      },
    );
    assert.equal(otherOperatorRequest.status, HttpStatus.OK);
  },
);
