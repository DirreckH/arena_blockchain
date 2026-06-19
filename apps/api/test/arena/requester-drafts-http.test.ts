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

type TestUser = {
  userId: string;
  roles?: SystemRole[];
};

type JsonResponse = {
  status: number;
  body: any;
};

const forbiddenSelfSurfaceKeys = [
  "userId",
  "createdByUserId",
  "updatedByUserId",
  "submittedByUserId",
  "reviewedByUserId",
] as const;

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

test(
  "self-facing requester draft and submission endpoints hide redundant identity fields",
  async () => {
    await withHttpArenaApp(async ({ baseUrl }) => {
      const ownerUser: TestUser = {
        userId: "requester_drafts_http_owner",
        roles: [SystemRole.User],
      };

      const createResponse = await requestJson(
        baseUrl,
        "/arena/propositions/drafts",
        {
          method: "POST",
          user: ownerUser,
          body: {
            title: "Requester drafts identity regression proposition",
            summary:
              "Verify draft and submission self surfaces stay free of internal identity echoes.",
            optionA: "Keep",
            optionB: "Leak",
            category: "ai",
          },
        },
      );

      assert.equal(createResponse.status, HttpStatus.CREATED);
      const propositionId = createResponse.body.propositionId as string;

      const draftListResponse = await requestJson(
        baseUrl,
        "/arena/propositions/drafts",
        {
          user: ownerUser,
        },
      );
      const draftDetailResponse = await requestJson(
        baseUrl,
        `/arena/propositions/drafts/${propositionId}`,
        {
          user: ownerUser,
        },
      );
      const draftUpdateResponse = await requestJson(
        baseUrl,
        `/arena/propositions/drafts/${propositionId}`,
        {
          method: "PATCH",
          user: ownerUser,
          body: {
            summary:
              "Updated draft summary for requester self identity regression coverage.",
            sampleConstraints: ["wallet_signed"],
            minEffectiveSample: 4,
          },
        },
      );
      const submitResponse = await requestJson(
        baseUrl,
        `/arena/propositions/drafts/${propositionId}/submit`,
        {
          method: "POST",
          user: ownerUser,
          body: {
            note: "submit_for_identity_lane",
          },
        },
      );
      const submittedDraftListResponse = await requestJson(
        baseUrl,
        "/arena/propositions/drafts?submissionStatus=submitted",
        {
          user: ownerUser,
        },
      );
      const submissionsListResponse = await requestJson(
        baseUrl,
        "/arena/propositions/submissions",
        {
          user: ownerUser,
        },
      );
      const submissionDetailResponse = await requestJson(
        baseUrl,
        `/arena/propositions/submissions/${propositionId}`,
        {
          user: ownerUser,
        },
      );
      const withdrawResponse = await requestJson(
        baseUrl,
        `/arena/propositions/submissions/${propositionId}/withdraw`,
        {
          method: "POST",
          user: ownerUser,
          body: {
            note: "revise_after_identity_check",
          },
        },
      );
      const submissionsAfterWithdrawResponse = await requestJson(
        baseUrl,
        "/arena/propositions/submissions",
        {
          user: ownerUser,
        },
      );

      assert.equal(draftListResponse.status, HttpStatus.OK);
      assert.equal(draftDetailResponse.status, HttpStatus.OK);
      assert.equal(draftUpdateResponse.status, HttpStatus.OK);
      assert.equal(submitResponse.status, HttpStatus.CREATED);
      assert.equal(submittedDraftListResponse.status, HttpStatus.OK);
      assert.equal(submissionsListResponse.status, HttpStatus.OK);
      assert.equal(submissionDetailResponse.status, HttpStatus.OK);
      assert.equal(withdrawResponse.status, HttpStatus.CREATED);
      assert.equal(submissionsAfterWithdrawResponse.status, HttpStatus.OK);

      assert.equal(draftListResponse.body.length, 1);
      assert.equal(draftDetailResponse.body.propositionId, propositionId);
      assert.equal(draftUpdateResponse.body.minEffectiveSample, 4);
      assert.equal(submitResponse.body.submissionStatus, "submitted");
      assert.equal(submittedDraftListResponse.body.length, 1);
      assert.equal(submissionsListResponse.body.length, 1);
      assert.equal(submissionDetailResponse.body.submissionStatus, "submitted");
      assert.equal(withdrawResponse.body.submissionStatus, "draft");
      assert.equal(submissionsAfterWithdrawResponse.body.length, 0);

      for (const body of [
        createResponse.body,
        draftListResponse.body,
        draftDetailResponse.body,
        draftUpdateResponse.body,
        submitResponse.body,
        submittedDraftListResponse.body,
        submissionsListResponse.body,
        submissionDetailResponse.body,
        withdrawResponse.body,
        submissionsAfterWithdrawResponse.body,
      ]) {
        assertNoForbiddenKeys(body, forbiddenSelfSurfaceKeys);
      }
    });
  },
);
