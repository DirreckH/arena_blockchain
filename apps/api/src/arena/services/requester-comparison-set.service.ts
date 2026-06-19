import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaNotFoundError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { RequesterReportPresetService } from "./requester-report-preset.service";

export interface RequesterComparisonSetViewModel {
  comparisonSetId: string;
  name: string;
  description: string | null;
  presetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RequesterComparisonSetListItemViewModel {
  comparisonSetId: string;
  name: string;
  description: string | null;
  presetIds: string[];
  updatedAt: string;
}

export interface RequesterComparisonSetListViewModel {
  totalCount: number;
  items: RequesterComparisonSetListItemViewModel[];
}

export interface CreateRequesterComparisonSetInput {
  name: string;
  description?: string | null;
  presetIds: string[];
}

export interface UpdateRequesterComparisonSetInput {
  name?: string;
  description?: string | null;
  presetIds?: string[];
}

export interface DeleteRequesterComparisonSetResult {
  comparisonSetId: string;
  deleted: true;
}

type StoredRequesterComparisonSetRecord = RequesterComparisonSetViewModel & {
  userId: string;
};

const REQUESTER_COMPARISON_SET_NAMESPACE = "arena.requester.comparison_sets";
const REQUESTER_COMPARISON_SET_EXPORT_NAMESPACE =
  "arena.requester.comparison_set_exports";
const REQUESTER_COMPARISON_SET_DELIVERY_POLICY_NAMESPACE =
  "arena.requester.comparison_set_delivery_policies";
const REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE =
  "arena.requester.comparison_set_delivery_runs";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizePresetIds(presetIds: string[]): string[] {
  return [...new Set(presetIds.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function normalizeStoredComparisonSet(
  value: unknown,
): StoredRequesterComparisonSetRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoredRequesterComparisonSetRecord>;
  if (
    typeof record.comparisonSetId !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.name !== "string" ||
    !Array.isArray(record.presetIds) ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    comparisonSetId: record.comparisonSetId,
    userId: record.userId,
    name: record.name,
    description:
      typeof record.description === "string" ? record.description : null,
    presetIds: normalizePresetIds(record.presetIds as string[]),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseStoredComparisonSets(
  value: unknown,
): StoredRequesterComparisonSetRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeStoredComparisonSet)
    .filter(
      (record): record is StoredRequesterComparisonSetRecord => record !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
}

function toPublicComparisonSet(
  record: StoredRequesterComparisonSetRecord,
): RequesterComparisonSetViewModel {
  return {
    comparisonSetId: record.comparisonSetId,
    name: record.name,
    description: record.description,
    presetIds: cloneValue(record.presetIds),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class RequesterComparisonSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly requesterReportPresets: RequesterReportPresetService,
  ) {}

  async listComparisonSetsForUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetListViewModel> {
    const items = await this.listStoredComparisonSets(userId, db);
    return {
      totalCount: items.length,
      items: items.map((item) => this.toListItem(item)),
    };
  }

  async createComparisonSetForUser(
    userId: string,
    input: CreateRequesterComparisonSetInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetViewModel> {
    const presetIds = normalizePresetIds(input.presetIds);
    await this.assertPresetOwnership(userId, presetIds, db);

    const now = new Date().toISOString();
    const record: StoredRequesterComparisonSetRecord = {
      comparisonSetId: this.ids.next("requester_comparison_set"),
      userId,
      name: input.name.trim(),
      description:
        typeof input.description === "string" ? input.description.trim() : null,
      presetIds,
      createdAt: now,
      updatedAt: now,
    };

    const current = await this.listStoredComparisonSets(userId, db);
    await this.persistComparisonSets(userId, [record, ...current], db);

    return toPublicComparisonSet(record);
  }

  async getComparisonSetForUser(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetViewModel> {
    const matched = await this.findStoredComparisonSet(userId, comparisonSetId, db);
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_comparison_set.not_found",
        `Requester comparison set ${comparisonSetId} was not found`,
      );
    }

    return toPublicComparisonSet(matched);
  }

  async updateComparisonSetForUser(
    userId: string,
    comparisonSetId: string,
    input: UpdateRequesterComparisonSetInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetViewModel> {
    const current = await this.listStoredComparisonSets(userId, db);
    const matched = current.find((item) => item.comparisonSetId === comparisonSetId) ?? null;
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_comparison_set.not_found",
        `Requester comparison set ${comparisonSetId} was not found`,
      );
    }

    const presetIds =
      input.presetIds !== undefined
        ? normalizePresetIds(input.presetIds)
        : matched.presetIds;
    await this.assertPresetOwnership(userId, presetIds, db);

    const updated: StoredRequesterComparisonSetRecord = {
      ...matched,
      name: typeof input.name === "string" ? input.name.trim() : matched.name,
      description:
        input.description !== undefined
          ? input.description?.trim() ?? null
          : matched.description,
      presetIds,
      updatedAt: new Date().toISOString(),
    };

    await this.persistComparisonSets(
      userId,
      current.map((item) =>
        item.comparisonSetId === comparisonSetId ? updated : item,
      ),
      db,
    );

    return toPublicComparisonSet(updated);
  }

  async deleteComparisonSetForUser(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DeleteRequesterComparisonSetResult> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const current = await this.listStoredComparisonSets(userId, tx);
      const matched =
        current.find((item) => item.comparisonSetId === comparisonSetId) ?? null;
      if (!matched) {
        throw new ArenaNotFoundError(
          "requester_comparison_set.not_found",
          `Requester comparison set ${comparisonSetId} was not found`,
        );
      }

      const next = current.filter(
        (item) => item.comparisonSetId !== comparisonSetId,
      );
      await this.persistComparisonSets(userId, next, tx);
      await this.deleteComparisonSetArtifacts(
        userId,
        comparisonSetId,
        tx,
      );

      return {
        comparisonSetId,
        deleted: true,
      };
    });
  }

  private async assertPresetOwnership(
    userId: string,
    presetIds: string[],
    db: ArenaDbClient,
  ): Promise<void> {
    await Promise.all(
      presetIds.map((presetId) =>
        this.requesterReportPresets.getReportPresetForUser(userId, presetId, db),
      ),
    );
  }

  private async findStoredComparisonSet(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetRecord | null> {
    const items = await this.listStoredComparisonSets(userId, db);
    return items.find((item) => item.comparisonSetId === comparisonSetId) ?? null;
  }

  private async listStoredComparisonSets(
    userId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterComparisonSetRecord[]> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );
    return parseStoredComparisonSets(record?.valueJson ?? null);
  }

  private async persistComparisonSets(
    userId: string,
    records: StoredRequesterComparisonSetRecord[],
    db: ArenaDbClient,
  ): Promise<void> {
    const key = this.buildStorageKey(userId);
    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena requester comparison sets for ${userId}`,
        valueJson: cloneValue(records) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester comparison sets for ${userId}`,
        valueJson: cloneValue(records) as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private async deleteComparisonSetArtifacts(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient,
  ): Promise<void> {
    const deliveryPolicyKey = this.buildDeliveryPolicyStorageKey(
      userId,
      comparisonSetId,
    );
    const deliveryPolicyRecord = await this.systemKeyValues.findByKey(
      deliveryPolicyKey,
      db,
    );

    if (Array.isArray(deliveryPolicyRecord?.valueJson)) {
      const policyIds = deliveryPolicyRecord.valueJson
        .map((item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { policyId?: unknown }).policyId === "string"
            ? (item as { policyId: string }).policyId
            : null,
        )
        .filter((policyId): policyId is string => policyId !== null);

      await Promise.all(
        policyIds.map((policyId) =>
          this.systemKeyValues.softDeleteByKey(
            this.buildDeliveryRunStorageKey(userId, comparisonSetId, policyId),
            db,
          ),
        ),
      );
    }

    await Promise.all([
      this.systemKeyValues.softDeleteByKey(
        this.buildComparisonSetExportStorageKey(userId, comparisonSetId),
        db,
      ),
      this.systemKeyValues.softDeleteByKey(deliveryPolicyKey, db),
    ]);
  }

  private buildStorageKey(userId: string): string {
    return `${REQUESTER_COMPARISON_SET_NAMESPACE}.${userId}`;
  }

  private buildComparisonSetExportStorageKey(
    userId: string,
    comparisonSetId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_EXPORT_NAMESPACE}.${userId}.${comparisonSetId}`;
  }

  private buildDeliveryPolicyStorageKey(
    userId: string,
    comparisonSetId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_DELIVERY_POLICY_NAMESPACE}.${userId}.${comparisonSetId}`;
  }

  private buildDeliveryRunStorageKey(
    userId: string,
    comparisonSetId: string,
    policyId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_DELIVERY_RUN_NAMESPACE}.${userId}.${comparisonSetId}.${policyId}`;
  }

  private toListItem(
    record: StoredRequesterComparisonSetRecord,
  ): RequesterComparisonSetListItemViewModel {
    return {
      comparisonSetId: record.comparisonSetId,
      name: record.name,
      description: record.description,
      presetIds: cloneValue(record.presetIds),
      updatedAt: record.updatedAt,
    };
  }
}
