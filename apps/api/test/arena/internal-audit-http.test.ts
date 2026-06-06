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

import { ArenaInternalAuditController } from "../../src/arena/internal-audit.controller";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { InternalAuditService } from "../../src/arena/services/internal-audit.service";
import {
  type ArenaHarness,
  createArenaHarness,
} from "./harness";

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
    user?: {
      userId: string;
      chainId?: number;
      roles?: SystemRole[];
    };
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

const withAuditHttpApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaInternalAuditController],
    providers: [
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
      {
        provide: InternalAuditService,
        useValue: harness.internalAuditService,
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

test("internal audit events route supports search filters sorting and pagination", async () => {
  await withAuditHttpApp(async ({ baseUrl, harness }) => {
    await harness.internalAuditService.record({
      entityType: "validation_market",
      entityId: "market_1",
      action: "runtime_contract.alert.release_ready",
      actorUserId: "ops_user_1",
      reason: "Release path is green again.",
      note: "Recovered after queue worker restart.",
      createdAt: new Date("2026-06-01T10:10:00.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "validation_market",
      entityId: "market_2",
      action: "runtime_contract.alert.release_blocked",
      actorUserId: "ops_user_1",
      reason: "Release path is blocked on scheduler_queue.",
      note: "Queue worker heartbeat missing.",
      createdAt: new Date("2026-06-01T10:20:00.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "proposition",
      entityId: "prop_1",
      action: "proposition.approved",
      actorUserId: "ops_user_2",
      reason: "Approved for publishing.",
      note: "Not part of the release-only filter.",
      createdAt: new Date("2026-06-01T10:30:00.000Z"),
    });

    const response = await requestJson(
      baseUrl,
      "/arena/internal/audit-events?actorUserId=ops_user_1&search=release&sortDirection=asc&limit=1&offset=1",
      {
        user: {
          userId: "ops_viewer_1",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.totalCount, 2);
    assert.equal(response.body.limit, 1);
    assert.equal(response.body.offset, 1);
    assert.equal(response.body.items.length, 1);
    assert.equal(
      response.body.items[0]?.action,
      "runtime_contract.alert.release_blocked",
    );
    assert.equal(response.body.items[0]?.actorUserId, "ops_user_1");
    assert.equal(response.body.items[0]?.entityType, "validation_market");
    assert.equal(response.body.items[0]?.entityId, "market_2");
  });
});
