import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaConflictError, ArenaNotFoundError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { RequesterComparisonSetService } from "./requester-comparison-set.service";
import type { RequesterComparisonSetDeliveryTransportConfig } from "./requester-comparison-set-delivery-transport.types";

export type RequesterComparisonSetDeliveryCadence = "daily";
export type RequesterComparisonSetDeliveryPolicyRunStatus =
  | "completed"
  | "failed";

export interface RequesterComparisonSetDeliveryPolicyErrorViewModel {
  code: string;
  message: string;
}

export interface RequesterComparisonSetDeliveryPolicyViewModel {
  policyId: string;
  userId: string;
  comparisonSetId: string;
  name: string;
  description: string | null;
  cadence: RequesterComparisonSetDeliveryCadence;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunStatus: RequesterComparisonSetDeliveryPolicyRunStatus | null;
  lastRunError: RequesterComparisonSetDeliveryPolicyErrorViewModel | null;
  enabled: boolean;
  retainedExportCount: number;
  transport: RequesterComparisonSetDeliveryTransportConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequesterComparisonSetDeliveryPolicyListViewModel {
  userId: string;
  comparisonSetId: string;
  totalCount: number;
  items: RequesterComparisonSetDeliveryPolicyViewModel[];
}

export interface DeleteRequesterComparisonSetDeliveryPolicyResult {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  deleted: true;
}

export interface CreateRequesterComparisonSetDeliveryPolicyInput {
  name: string;
  description?: string | null;
  cadence: RequesterComparisonSetDeliveryCadence;
  nextRunAt: string;
  enabled: boolean;
  retainedExportCount?: number;
  transport?: RequesterComparisonSetDeliveryTransportConfig | null;
}

export interface UpdateRequesterComparisonSetDeliveryPolicyInput {
  name?: string;
  description?: string | null;
  cadence?: RequesterComparisonSetDeliveryCadence;
  nextRunAt?: string;
  enabled?: boolean;
  retainedExportCount?: number;
  transport?: RequesterComparisonSetDeliveryTransportConfig | null;
}

type StoredRequesterComparisonSetDeliveryPolicyRecord =
  RequesterComparisonSetDeliveryPolicyViewModel;

const REQUESTER_COMPARISON_SET_DELIVERY_POLICY_NAMESPACE =
  "arena.requester.comparison_set_delivery_policies";
const REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE =
  "arena.requester.comparison_set_delivery_runs";
const DEFAULT_RETAINED_EXPORT_COUNT = 5;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizePolicyRunStatus(
  value: unknown,
): RequesterComparisonSetDeliveryPolicyRunStatus | null {
  if (value === "completed" || value === "failed") {
    return value;
  }

  return null;
}

function normalizePolicyRunError(
  value: unknown,
): RequesterComparisonSetDeliveryPolicyErrorViewModel | null {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { code?: unknown }).code !== "string" ||
    typeof (value as { message?: unknown }).message !== "string"
  ) {
    return null;
  }

  return {
    code: (value as { code: string }).code,
    message: (value as { message: string }).message,
  };
}

function normalizeTransportConfig(
  value: unknown,
): RequesterComparisonSetDeliveryTransportConfig | null {
  if (
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "webhook" &&
    typeof (value as { targetUrl?: unknown }).targetUrl === "string" &&
    ((value as { credentialKey?: unknown }).credentialKey === undefined ||
      (value as { credentialKey?: unknown }).credentialKey === null ||
      typeof (value as { credentialKey?: unknown }).credentialKey === "string")
  ) {
    const normalizedCredentialKey =
      typeof (value as { credentialKey?: unknown }).credentialKey === "string"
        ? (value as { credentialKey: string }).credentialKey.trim()
        : null;

    return {
      type: "webhook",
      targetUrl: (value as { targetUrl: string }).targetUrl,
      credentialKey:
        normalizedCredentialKey && normalizedCredentialKey.length > 0
          ? normalizedCredentialKey
          : null,
    };
  }

  return null;
}

function parseStoredPolicies(
  value: unknown,
): StoredRequesterComparisonSetDeliveryPolicyRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is StoredRequesterComparisonSetDeliveryPolicyRecord =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as { policyId?: unknown }).policyId === "string" &&
            typeof (item as { userId?: unknown }).userId === "string" &&
            typeof (item as { comparisonSetId?: unknown }).comparisonSetId ===
              "string" &&
            typeof (item as { name?: unknown }).name === "string" &&
            typeof (item as { cadence?: unknown }).cadence === "string" &&
            typeof (item as { nextRunAt?: unknown }).nextRunAt === "string" &&
            typeof (item as { enabled?: unknown }).enabled === "boolean" &&
            (typeof (item as { retainedExportCount?: unknown }).retainedExportCount ===
              "number" ||
              (item as { retainedExportCount?: unknown }).retainedExportCount ===
                undefined) &&
            typeof (item as { createdAt?: unknown }).createdAt === "string" &&
            typeof (item as { updatedAt?: unknown }).updatedAt === "string",
        ),
    )
    .map((item) => ({
      ...item,
      lastRunStatus: normalizePolicyRunStatus(item.lastRunStatus),
      lastRunError: normalizePolicyRunError(item.lastRunError),
      transport: normalizeTransportConfig(item.transport),
      retainedExportCount:
        typeof item.retainedExportCount === "number"
          ? item.retainedExportCount
          : DEFAULT_RETAINED_EXPORT_COUNT,
    }))
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
}

@Injectable()
export class RequesterComparisonSetDeliveryPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly requesterComparisonSets: RequesterComparisonSetService,
  ) {}

  async listPoliciesForUser(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyListViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      userId,
      comparisonSetId,
      db,
    );
    const items = await this.listStoredPolicies(userId, comparisonSetId, db);
    return {
      userId,
      comparisonSetId,
      totalCount: items.length,
      items: items.map(cloneValue),
    };
  }

  async createPolicyForUser(
    userId: string,
    comparisonSetId: string,
    input: CreateRequesterComparisonSetDeliveryPolicyInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      userId,
      comparisonSetId,
      db,
    );
    const now = new Date().toISOString();
    const record: StoredRequesterComparisonSetDeliveryPolicyRecord = {
      policyId: this.ids.next("requester_comparison_set_delivery_policy"),
      userId,
      comparisonSetId,
      name: input.name.trim(),
      description:
        typeof input.description === "string" ? input.description.trim() : null,
      cadence: input.cadence,
      nextRunAt: input.nextRunAt,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunError: null,
      enabled: input.enabled,
      retainedExportCount:
        input.retainedExportCount ?? DEFAULT_RETAINED_EXPORT_COUNT,
      transport: input.transport
        ? normalizeTransportConfig(input.transport)
        : null,
      createdAt: now,
      updatedAt: now,
    };

    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    await this.persistPolicies(userId, comparisonSetId, [record, ...current], db);
    return cloneValue(record);
  }

  async getPolicyForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      userId,
      comparisonSetId,
      db,
    );
    const matched = await this.findStoredPolicy(
      userId,
      comparisonSetId,
      policyId,
      db,
    );
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_delivery_policy.not_found",
        `Requester comparison set delivery policy ${policyId} was not found`,
      );
    }

    return cloneValue(matched);
  }

  async updatePolicyForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    input: UpdateRequesterComparisonSetDeliveryPolicyInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    const matched = current.find((item) => item.policyId === policyId) ?? null;
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_delivery_policy.not_found",
        `Requester comparison set delivery policy ${policyId} was not found`,
      );
    }

    const updated: StoredRequesterComparisonSetDeliveryPolicyRecord = {
      ...matched,
      name: typeof input.name === "string" ? input.name.trim() : matched.name,
      description:
        input.description !== undefined
          ? input.description?.trim() ?? null
          : matched.description,
      cadence: input.cadence ?? matched.cadence,
      nextRunAt: input.nextRunAt ?? matched.nextRunAt,
      enabled: input.enabled ?? matched.enabled,
      retainedExportCount:
        input.retainedExportCount ?? matched.retainedExportCount,
      transport:
        input.transport !== undefined
          ? input.transport
            ? normalizeTransportConfig(input.transport)
            : null
          : matched.transport,
      updatedAt: new Date().toISOString(),
    };

    await this.persistPolicies(
      userId,
      comparisonSetId,
      current.map((item) => (item.policyId === policyId ? updated : item)),
      db,
    );
    return cloneValue(updated);
  }

  async pausePolicyForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    const policy = current.find((item) => item.policyId === policyId) ?? null;

    if (!policy) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_delivery_policy.not_found",
        `Requester comparison set delivery policy ${policyId} was not found`,
      );
    }

    if (!policy.enabled) {
      throw new ArenaConflictError(
        "requester_comparison_set_delivery_policy.pause.already_paused",
        `Requester comparison set delivery policy ${policyId} is already paused`,
      );
    }

    return this.updatePolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      {
        enabled: false,
      },
      db,
    );
  }

  async resumePolicyForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    const policy = current.find((item) => item.policyId === policyId) ?? null;

    if (!policy) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_delivery_policy.not_found",
        `Requester comparison set delivery policy ${policyId} was not found`,
      );
    }

    if (policy.enabled) {
      throw new ArenaConflictError(
        "requester_comparison_set_delivery_policy.resume.not_paused",
        `Requester comparison set delivery policy ${policyId} is not paused`,
      );
    }

    return this.updatePolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      {
        enabled: true,
      },
      db,
    );
  }

  async deletePolicyForUser(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DeleteRequesterComparisonSetDeliveryPolicyResult> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const current = await this.listStoredPolicies(userId, comparisonSetId, tx);
      const matched = current.find((item) => item.policyId === policyId) ?? null;
      if (!matched) {
        throw new ArenaNotFoundError(
          "requester_comparison_set_delivery_policy.not_found",
          `Requester comparison set delivery policy ${policyId} was not found`,
        );
      }

      await this.persistPolicies(
        userId,
        comparisonSetId,
        current.filter((item) => item.policyId !== policyId),
        tx,
      );
      await this.systemKeyValues.softDeleteByKey(
        this.buildRunStorageKey(userId, comparisonSetId, policyId),
        tx,
      );

      return {
        userId,
        comparisonSetId,
        policyId,
        deleted: true,
      };
    });
  }

  async recordPolicyRun(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    runAt: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const policy = await this.getPolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      db,
    );
    const nextRunAt = this.computeNextRunAt(policy.cadence, policy.nextRunAt);
    return this.updatePolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      {
        nextRunAt,
      },
      db,
    ).then((updated) => {
      const finalPolicy = {
        ...updated,
        lastRunAt: runAt,
        lastRunStatus: "completed" as const,
        lastRunError: null,
      };
      return this.persistPolicyReplacement(
        userId,
        comparisonSetId,
        policyId,
        finalPolicy,
        db,
      );
    });
  }

  async recordPolicyFailure(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    error: RequesterComparisonSetDeliveryPolicyErrorViewModel,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const policy = await this.getPolicyForUser(
      userId,
      comparisonSetId,
      policyId,
      db,
    );
    const updatedPolicy: StoredRequesterComparisonSetDeliveryPolicyRecord = {
      ...policy,
      lastRunStatus: "failed",
      lastRunError: cloneValue(error),
      updatedAt: new Date().toISOString(),
    };

    return this.persistPolicyReplacement(
      userId,
      comparisonSetId,
      policyId,
      updatedPolicy,
      db,
    );
  }

  async listDuePolicies(
    now: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel[]> {
    const all = await this.listAllStoredPolicies(db);
    const nowTime = Date.parse(now);
    return all.filter(
      (item) => item.enabled && Date.parse(item.nextRunAt) <= nowTime,
    );
  }

  private async persistPolicyReplacement(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    replacement: StoredRequesterComparisonSetDeliveryPolicyRecord,
    db: ArenaDbClient,
  ): Promise<RequesterComparisonSetDeliveryPolicyViewModel> {
    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    await this.persistPolicies(
      userId,
      comparisonSetId,
      current.map((item) => (item.policyId === policyId ? replacement : item)),
      db,
    );
    return cloneValue(replacement);
  }

  private async findStoredPolicy(
    userId: string,
    comparisonSetId: string,
    policyId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetDeliveryPolicyRecord | null> {
    const current = await this.listStoredPolicies(userId, comparisonSetId, db);
    return current.find((item) => item.policyId === policyId) ?? null;
  }

  private async listStoredPolicies(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetDeliveryPolicyRecord[]> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId, comparisonSetId),
      db,
    );
    return parseStoredPolicies(record?.valueJson ?? null);
  }

  private async listAllStoredPolicies(
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetDeliveryPolicyRecord[]> {
    const records = await this.systemKeyValues.listByKeyPrefix(
      REQUESTER_COMPARISON_SET_DELIVERY_POLICY_NAMESPACE,
      db,
    );
    return records.flatMap((item) => parseStoredPolicies(item.valueJson));
  }

  private async persistPolicies(
    userId: string,
    comparisonSetId: string,
    records: StoredRequesterComparisonSetDeliveryPolicyRecord[],
    db: ArenaDbClient,
  ): Promise<void> {
    const key = this.buildStorageKey(userId, comparisonSetId);
    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena requester comparison set delivery policies for ${userId} and ${comparisonSetId}`,
        valueJson: cloneValue(records) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester comparison set delivery policies for ${userId} and ${comparisonSetId}`,
        valueJson: cloneValue(records) as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private buildStorageKey(userId: string, comparisonSetId: string): string {
    return `${REQUESTER_COMPARISON_SET_DELIVERY_POLICY_NAMESPACE}.${userId}.${comparisonSetId}`;
  }

  private buildRunStorageKey(
    userId: string,
    comparisonSetId: string,
    policyId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE}.${userId}.${comparisonSetId}.${policyId}`;
  }

  private computeNextRunAt(
    cadence: RequesterComparisonSetDeliveryCadence,
    runAt: string,
  ): string {
    const base = new Date(runAt);
    if (cadence === "daily") {
      return new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    return base.toISOString();
  }
}
