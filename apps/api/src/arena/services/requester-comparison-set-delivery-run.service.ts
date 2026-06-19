import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { ArenaNotFoundError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { RequesterComparisonSetDeliveryPolicyService } from "./requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetService } from "./requester-comparison-set.service";

const REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE =
  "arena.requester.comparison_set_delivery_runs";

export type RequesterComparisonSetDeliveryRunTriggerType =
  | "manual"
  | "automation";

export type RequesterComparisonSetDeliveryRunReplayFilter =
  | "all"
  | "fresh_only"
  | "replayed_only";

export type RequesterComparisonSetDeliveryRunStatus =
  | "completed"
  | "failed";

export interface RequesterComparisonSetDeliveryRunOriginViewModel {
  type:
    | "delivery_policy_manual"
    | "delivery_policy_automation";
  policyId: string;
  policyName: string | null;
}

export interface RequesterComparisonSetDeliveryRunViewModel {
  runId: string;
  comparisonSetId: string;
  policyId: string;
  retriedRunId: string | null;
  triggerType: RequesterComparisonSetDeliveryRunTriggerType;
  status: RequesterComparisonSetDeliveryRunStatus;
  startedAt: string;
  completedAt: string;
  exportId: string | null;
  retainedExportAvailable: boolean;
  origin: RequesterComparisonSetDeliveryRunOriginViewModel;
  delivery: {
    deliveredAt: string;
    statusCode: number;
    authentication: {
      kind: "none" | "bearer";
      credentialKey: string | null;
    };
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface RequesterComparisonSetDeliveryRunListViewModel {
  comparisonSetId: string;
  policyId: string;
  totalCount: number;
  storedCount: number;
  appliedFilters: {
    status: RequesterComparisonSetDeliveryRunStatus | null;
    triggerType: RequesterComparisonSetDeliveryRunTriggerType | null;
    replay: RequesterComparisonSetDeliveryRunReplayFilter;
    limit: number | null;
  };
  items: RequesterComparisonSetDeliveryRunViewModel[];
}

export interface CreateRequesterComparisonSetDeliveryRunInput {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  retriedRunId?: string | null;
  triggerType: RequesterComparisonSetDeliveryRunTriggerType;
  status: RequesterComparisonSetDeliveryRunStatus;
  startedAt: string;
  completedAt: string;
  exportId: string | null;
  retainedExportAvailable?: boolean;
  origin: RequesterComparisonSetDeliveryRunOriginViewModel;
  delivery?: RequesterComparisonSetDeliveryRunViewModel["delivery"];
  error?: {
    code: string;
    message: string;
  } | null;
}

type StoredRequesterComparisonSetDeliveryRunRecord =
  RequesterComparisonSetDeliveryRunViewModel & {
    userId: string;
  };

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizeRunDelivery(
  value: unknown,
): RequesterComparisonSetDeliveryRunViewModel["delivery"] {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { deliveredAt?: unknown }).deliveredAt === "string" &&
    typeof (value as { statusCode?: unknown }).statusCode === "number" &&
    typeof (value as { authentication?: unknown }).authentication === "object" &&
    (value as { authentication?: unknown }).authentication !== null &&
    (((value as { authentication: { kind?: unknown } }).authentication.kind ===
      "none") ||
      ((value as { authentication: { kind?: unknown } }).authentication.kind ===
        "bearer")) &&
    (((value as { authentication: { credentialKey?: unknown } }).authentication
      .credentialKey === null) ||
      typeof (value as { authentication: { credentialKey?: unknown } })
        .authentication.credentialKey === "string")
  ) {
    return {
      deliveredAt: (value as { deliveredAt: string }).deliveredAt,
      statusCode: (value as { statusCode: number }).statusCode,
      authentication: {
        kind: (value as { authentication: { kind: "none" | "bearer" } })
          .authentication.kind,
        credentialKey:
          (value as { authentication: { credentialKey: string | null } })
            .authentication.credentialKey,
      },
    };
  }

  return null;
}

function parseStoredRuns(
  value: unknown,
): StoredRequesterComparisonSetDeliveryRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is StoredRequesterComparisonSetDeliveryRunRecord =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as { runId?: unknown }).runId === "string" &&
            typeof (item as { userId?: unknown }).userId === "string" &&
            typeof (item as { comparisonSetId?: unknown }).comparisonSetId ===
              "string" &&
            typeof (item as { policyId?: unknown }).policyId === "string" &&
            (((item as { retriedRunId?: unknown }).retriedRunId === undefined) ||
              ((item as { retriedRunId?: unknown }).retriedRunId === null) ||
              (typeof (item as { retriedRunId?: unknown }).retriedRunId ===
                "string")) &&
            ((item as { triggerType?: unknown }).triggerType === "manual" ||
              (item as { triggerType?: unknown }).triggerType === "automation") &&
            (((item as { status?: unknown }).status === "completed") ||
              ((item as { status?: unknown }).status === "failed")) &&
            typeof (item as { startedAt?: unknown }).startedAt === "string" &&
            typeof (item as { completedAt?: unknown }).completedAt === "string" &&
            ((item as { exportId?: unknown }).exportId === null ||
              typeof (item as { exportId?: unknown }).exportId === "string") &&
            (((item as { retainedExportAvailable?: unknown })
              .retainedExportAvailable === undefined) ||
              typeof (item as { retainedExportAvailable?: unknown })
                .retainedExportAvailable === "boolean") &&
            (((item as { delivery?: unknown }).delivery === undefined) ||
              ((item as { delivery?: unknown }).delivery === null) ||
              (typeof (item as { delivery?: unknown }).delivery === "object" &&
                (item as { delivery?: unknown }).delivery !== null &&
                typeof (item as { delivery: { deliveredAt?: unknown } }).delivery
                  .deliveredAt === "string" &&
                typeof (item as { delivery: { statusCode?: unknown } }).delivery
                  .statusCode === "number" &&
                typeof (item as { delivery: { authentication?: unknown } }).delivery
                  .authentication === "object" &&
                (item as {
                  delivery: { authentication: { kind?: unknown } };
                }).delivery.authentication !== null &&
                (((item as {
                  delivery: { authentication: { kind?: unknown } };
                }).delivery.authentication.kind === "none") ||
                  ((item as {
                    delivery: { authentication: { kind?: unknown } };
                  }).delivery.authentication.kind === "bearer")) &&
                (((item as {
                  delivery: {
                    authentication: { credentialKey?: unknown };
                  };
                }).delivery.authentication.credentialKey === null) ||
                  typeof (item as {
                    delivery: {
                      authentication: { credentialKey?: unknown };
                    };
                  }).delivery.authentication.credentialKey === "string"))) &&
            typeof (item as { origin?: unknown }).origin === "object" &&
            item.origin !== null &&
            (((item as { origin: { type?: unknown } }).origin.type ===
              "delivery_policy_manual") ||
              ((item as { origin: { type?: unknown } }).origin.type ===
                "delivery_policy_automation")) &&
            typeof (item as { origin: { policyId?: unknown } }).origin.policyId ===
              "string" &&
            ((item as { error?: unknown }).error === null ||
              (typeof (item as { error?: unknown }).error === "object" &&
                (item as { error?: unknown }).error !== null &&
                typeof (item as { error: { code?: unknown } }).error.code ===
                  "string" &&
                typeof (item as { error: { message?: unknown } }).error.message ===
                  "string")),
        ),
    )
    .map((item) => ({
      ...item,
      retriedRunId:
        typeof (item as { retriedRunId?: unknown }).retriedRunId === "string"
          ? (item as { retriedRunId: string }).retriedRunId
          : null,
      retainedExportAvailable:
        typeof (item as { retainedExportAvailable?: unknown })
          .retainedExportAvailable === "boolean"
          ? (item as { retainedExportAvailable: boolean }).retainedExportAvailable
          : item.exportId !== null,
      delivery: normalizeRunDelivery(item.delivery),
    }))
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt) ||
        Date.parse(right.startedAt) - Date.parse(left.startedAt),
    );
}

function toPublicDeliveryRun(
  record: StoredRequesterComparisonSetDeliveryRunRecord,
): RequesterComparisonSetDeliveryRunViewModel {
  return {
    runId: record.runId,
    comparisonSetId: record.comparisonSetId,
    policyId: record.policyId,
    retriedRunId: record.retriedRunId,
    triggerType: record.triggerType,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    exportId: record.exportId,
    retainedExportAvailable: record.retainedExportAvailable,
    origin: cloneValue(record.origin),
    delivery: cloneValue(record.delivery),
    error: cloneValue(record.error),
  };
}

@Injectable()
export class RequesterComparisonSetDeliveryRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly requesterComparisonSets: RequesterComparisonSetService,
    private readonly requesterComparisonSetDeliveryPolicies: RequesterComparisonSetDeliveryPolicyService,
  ) {}

  async listRunsForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    status?: RequesterComparisonSetDeliveryRunStatus,
    triggerType?: RequesterComparisonSetDeliveryRunTriggerType,
    replay: RequesterComparisonSetDeliveryRunReplayFilter = "all",
    limit?: number,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryRunListViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      userId,
      comparisonSetId,
      db,
    );
    await this.requesterComparisonSetDeliveryPolicies.getPolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      db,
    );
    const stored = await this.listStoredRuns(userId, comparisonSetId, policyId, db);
    const filtered = stored
      .filter((item) => (typeof status === "string" ? item.status === status : true))
      .filter((item) =>
        typeof triggerType === "string" ? item.triggerType === triggerType : true,
      )
      .filter((item) => {
        if (replay === "fresh_only") {
          return item.retriedRunId === null;
        }
        if (replay === "replayed_only") {
          return item.retriedRunId !== null;
        }
        return true;
      });
    const items =
      typeof limit === "number" ? filtered.slice(0, limit) : filtered;

    return {
      comparisonSetId,
      policyId,
      totalCount: items.length,
      storedCount: stored.length,
      appliedFilters: {
        status: status ?? null,
        triggerType: triggerType ?? null,
        replay,
        limit: limit ?? null,
      },
      items: items.map((item) => toPublicDeliveryRun(item)),
    };
  }

  async createRunRecord(
    input: CreateRequesterComparisonSetDeliveryRunInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryRunViewModel> {
    const record: StoredRequesterComparisonSetDeliveryRunRecord = {
      runId: this.ids.next("requester_comparison_set_delivery_run"),
      userId: input.userId,
      comparisonSetId: input.comparisonSetId,
      policyId: input.policyId,
      retriedRunId: input.retriedRunId ?? null,
      triggerType: input.triggerType,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      exportId: input.exportId,
      retainedExportAvailable: input.retainedExportAvailable ?? input.exportId !== null,
      delivery: input.delivery ? cloneValue(input.delivery) : null,
      origin: cloneValue(input.origin),
      error: input.error ? cloneValue(input.error) : null,
    };

    const current = await this.listStoredRuns(
      input.userId,
      input.comparisonSetId,
      input.policyId,
      db,
    );
    const next = [record, ...current].slice(0, 50);
    const key = this.buildStorageKey(
      input.userId,
      input.comparisonSetId,
      input.policyId,
    );

    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena requester comparison set delivery runs for ${input.userId}, ${input.comparisonSetId}, and ${input.policyId}`,
        valueJson: cloneValue(next) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester comparison set delivery runs for ${input.userId}, ${input.comparisonSetId}, and ${input.policyId}`,
        valueJson: cloneValue(next) as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return toPublicDeliveryRun(record);
  }

  async getRunForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    runId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryRunViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      userId,
      comparisonSetId,
      db,
    );
    await this.requesterComparisonSetDeliveryPolicies.getPolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      db,
    );
    const run =
      (await this.listStoredRuns(userId, comparisonSetId, policyId, db)).find(
        (item) => item.runId === runId,
      ) ?? null;

    if (!run) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_delivery_run.not_found",
        `Requester comparison set delivery run ${runId} was not found`,
      );
    }

    return toPublicDeliveryRun(run);
  }

  private async listStoredRuns(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetDeliveryRunRecord[]> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId, comparisonSetId, policyId),
      db,
    );
    return parseStoredRuns(record?.valueJson ?? null);
  }

  private buildStorageKey(
    userId: string,
    comparisonSetId: string,
    policyId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE}.${userId}.${comparisonSetId}.${policyId}`;
  }
}
