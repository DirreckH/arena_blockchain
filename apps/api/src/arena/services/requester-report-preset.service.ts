import { Injectable } from "@nestjs/common";
import type { Prisma, PropositionCategory } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { ArenaConflictError, ArenaNotFoundError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

export type RequesterReportPresetStatusScope =
  | "all"
  | "settled"
  | "unresolved";

export type RequesterReportPresetExportFormat = "json" | "csv";

export interface RequesterReportPresetConfig {
  windowDays: number;
  categories: PropositionCategory[];
  marketEnabledOnly: boolean;
  statusScope: RequesterReportPresetStatusScope;
  defaultExportFormat: RequesterReportPresetExportFormat;
}

export interface RequesterReportPresetViewModel {
  presetId: string;
  name: string;
  description: string | null;
  config: RequesterReportPresetConfig;
  createdAt: string;
  updatedAt: string;
}

export interface RequesterReportPresetListItemViewModel {
  presetId: string;
  name: string;
  description: string | null;
  updatedAt: string;
}

export interface RequesterReportPresetListViewModel {
  totalCount: number;
  items: RequesterReportPresetListItemViewModel[];
}

export interface CreateRequesterReportPresetInput {
  name: string;
  description?: string | null;
  windowDays?: number;
  categories?: PropositionCategory[];
  marketEnabledOnly?: boolean;
  statusScope?: RequesterReportPresetStatusScope;
  defaultExportFormat?: RequesterReportPresetExportFormat;
}

export interface UpdateRequesterReportPresetInput {
  name?: string;
  description?: string | null;
  windowDays?: number;
  categories?: PropositionCategory[];
  marketEnabledOnly?: boolean;
  statusScope?: RequesterReportPresetStatusScope;
  defaultExportFormat?: RequesterReportPresetExportFormat;
}

export interface DeleteRequesterReportPresetResult {
  presetId: string;
  deleted: true;
}

type StoredRequesterReportPresetRecord = RequesterReportPresetViewModel & {
  userId: string;
};
type StoredRequesterComparisonSetReference = {
  comparisonSetId: string;
  presetIds: string[];
};

const REQUESTER_REPORT_PRESET_NAMESPACE = "arena.requester.report_presets";
const REQUESTER_COMPARISON_SET_NAMESPACE = "arena.requester.comparison_sets";
const DEFAULT_REQUESTER_REPORT_PRESET_CONFIG: RequesterReportPresetConfig = {
  windowDays: 30,
  categories: [],
  marketEnabledOnly: false,
  statusScope: "all",
  defaultExportFormat: "json",
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizeCategories(
  categories: PropositionCategory[] | undefined,
): PropositionCategory[] {
  if (!categories || categories.length === 0) {
    return [];
  }

  return [...new Set(categories)];
}

function normalizeConfig(
  input: Pick<
    CreateRequesterReportPresetInput,
    | "windowDays"
    | "categories"
    | "marketEnabledOnly"
    | "statusScope"
    | "defaultExportFormat"
  >,
  base: RequesterReportPresetConfig = DEFAULT_REQUESTER_REPORT_PRESET_CONFIG,
): RequesterReportPresetConfig {
  return {
    windowDays: input.windowDays ?? base.windowDays,
    categories:
      input.categories !== undefined
        ? normalizeCategories(input.categories)
        : cloneValue(base.categories),
    marketEnabledOnly:
      input.marketEnabledOnly ?? base.marketEnabledOnly,
    statusScope: input.statusScope ?? base.statusScope,
    defaultExportFormat:
      input.defaultExportFormat ?? base.defaultExportFormat,
  };
}

function normalizeStoredPreset(
  value: unknown,
): StoredRequesterReportPresetRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoredRequesterReportPresetRecord>;
  if (
    typeof record.presetId !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.name !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  const storedConfig =
    record.config && typeof record.config === "object"
      ? (record.config as Partial<RequesterReportPresetConfig>)
      : {};

  return {
    presetId: record.presetId,
    userId: record.userId,
    name: record.name,
    description:
      typeof record.description === "string" ? record.description : null,
    config: normalizeConfig(
      {
        windowDays: storedConfig.windowDays,
        categories: Array.isArray(storedConfig.categories)
          ? (storedConfig.categories as PropositionCategory[])
          : undefined,
        marketEnabledOnly: storedConfig.marketEnabledOnly,
        statusScope: storedConfig.statusScope,
        defaultExportFormat: storedConfig.defaultExportFormat,
      },
      DEFAULT_REQUESTER_REPORT_PRESET_CONFIG,
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseStoredRequesterReportPresets(
  value: unknown,
): StoredRequesterReportPresetRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeStoredPreset)
    .filter(
      (record): record is StoredRequesterReportPresetRecord => record !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
}

function toPublicReportPreset(
  record: StoredRequesterReportPresetRecord,
): RequesterReportPresetViewModel {
  return {
    presetId: record.presetId,
    name: record.name,
    description: record.description,
    config: cloneValue(record.config),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseStoredComparisonSetReferences(
  value: unknown,
): StoredRequesterComparisonSetReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { comparisonSetId?: unknown }).comparisonSetId !==
          "string" ||
        !Array.isArray((item as { presetIds?: unknown }).presetIds)
      ) {
        return null;
      }

      return {
        comparisonSetId: (item as { comparisonSetId: string }).comparisonSetId,
        presetIds: [
          ...new Set(
            (item as { presetIds: unknown[] }).presetIds.filter(
              (presetId): presetId is string =>
                typeof presetId === "string" && presetId.trim().length > 0,
            ),
          ),
        ],
      } satisfies StoredRequesterComparisonSetReference;
    })
    .filter(
      (record): record is StoredRequesterComparisonSetReference => record !== null,
    );
}

@Injectable()
export class RequesterReportPresetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
  ) {}

  async listReportPresetsForUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterReportPresetListViewModel> {
    const presets = await this.listStoredPresets(userId, db);

    return {
      totalCount: presets.length,
      items: presets.map((preset) => this.toListItem(preset)),
    };
  }

  async createReportPresetForUser(
    userId: string,
    input: CreateRequesterReportPresetInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterReportPresetViewModel> {
    const now = new Date().toISOString();
    const preset: StoredRequesterReportPresetRecord = {
      presetId: this.ids.next("requester_report_preset"),
      userId,
      name: input.name.trim(),
      description:
        typeof input.description === "string" ? input.description.trim() : null,
      config: normalizeConfig(input),
      createdAt: now,
      updatedAt: now,
    };

    const currentPresets = await this.listStoredPresets(userId, db);
    const nextPresets = [preset, ...currentPresets];
    await this.persistPresets(userId, nextPresets, db);

    return toPublicReportPreset(preset);
  }

  async getReportPresetForUser(
    userId: string,
    presetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterReportPresetViewModel> {
    const preset = await this.findStoredPreset(userId, presetId, db);
    if (!preset) {
      throw new ArenaNotFoundError(
        "requester_report_preset.not_found",
        `Requester report preset ${presetId} was not found`,
      );
    }

    return toPublicReportPreset(preset);
  }

  async updateReportPresetForUser(
    userId: string,
    presetId: string,
    input: UpdateRequesterReportPresetInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterReportPresetViewModel> {
    const presets = await this.listStoredPresets(userId, db);
    const matched = presets.find((preset) => preset.presetId === presetId) ?? null;
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_report_preset.not_found",
        `Requester report preset ${presetId} was not found`,
      );
    }

    const updatedPreset: StoredRequesterReportPresetRecord = {
      ...matched,
      name:
        typeof input.name === "string" ? input.name.trim() : matched.name,
      description:
        input.description !== undefined
          ? input.description?.trim() ?? null
          : matched.description,
      config: normalizeConfig(input, matched.config),
      updatedAt: new Date().toISOString(),
    };

    const nextPresets = presets.map((preset) =>
      preset.presetId === presetId ? updatedPreset : preset,
    );
    await this.persistPresets(userId, nextPresets, db);

    return toPublicReportPreset(updatedPreset);
  }

  async deleteReportPresetForUser(
    userId: string,
    presetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DeleteRequesterReportPresetResult> {
    const presets = await this.listStoredPresets(userId, db);
    const nextPresets = presets.filter((preset) => preset.presetId !== presetId);

    if (nextPresets.length === presets.length) {
      throw new ArenaNotFoundError(
        "requester_report_preset.not_found",
        `Requester report preset ${presetId} was not found`,
      );
    }

    const referencingComparisonSetIds =
      await this.findReferencingComparisonSetIds(userId, presetId, db);
    if (referencingComparisonSetIds.length > 0) {
      throw new ArenaConflictError(
        "requester_report_preset.in_use_by_comparison_set",
        "Requester report preset cannot be deleted while saved comparison sets still reference it",
      );
    }

    await this.persistPresets(userId, nextPresets, db);

    return {
      presetId,
      deleted: true,
    };
  }

  private async findStoredPreset(
    userId: string,
    presetId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterReportPresetRecord | null> {
    const presets = await this.listStoredPresets(userId, db);
    return presets.find((preset) => preset.presetId === presetId) ?? null;
  }

  private async listStoredPresets(
    userId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterReportPresetRecord[]> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );

    return parseStoredRequesterReportPresets(record?.valueJson ?? null);
  }

  private async persistPresets(
    userId: string,
    presets: StoredRequesterReportPresetRecord[],
    db: ArenaDbClient,
  ): Promise<void> {
    const key = this.buildStorageKey(userId);
    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena requester report presets for ${userId}`,
        valueJson: cloneValue(presets) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester report presets for ${userId}`,
        valueJson: cloneValue(presets) as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private async findReferencingComparisonSetIds(
    userId: string,
    presetId: string,
    db: ArenaDbClient,
  ): Promise<string[]> {
    const records = await this.systemKeyValues.listByKeyPrefix(
      `${REQUESTER_COMPARISON_SET_NAMESPACE}.${userId}`,
      db,
    );

    return records
      .flatMap((record) => parseStoredComparisonSetReferences(record.valueJson))
      .filter((record) => record.presetIds.includes(presetId))
      .map((record) => record.comparisonSetId);
  }

  private buildStorageKey(userId: string): string {
    return `${REQUESTER_REPORT_PRESET_NAMESPACE}.${userId}`;
  }

  private toListItem(
    preset: StoredRequesterReportPresetRecord,
  ): RequesterReportPresetListItemViewModel {
    return {
      presetId: preset.presetId,
      name: preset.name,
      description: preset.description,
      updatedAt: preset.updatedAt,
    };
  }
}
