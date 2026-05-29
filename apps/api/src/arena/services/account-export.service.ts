import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  CreateRespondentAccountExportInput,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportItemViewModel,
  RespondentAccountExportListViewModel,
  RespondentAccountExportPeriod,
  RespondentAccountExportSettlementAttachmentViewModel,
  RespondentAccountPreferencesViewModel,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaNotFoundError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { AccountPreferencesService } from "./account-preferences.service";
import { AccountViewService } from "./account-view.service";

type StoredAccountExportRecord = {
  exportId: string;
  userId: string;
  status: "completed";
  format: "json";
  period: RespondentAccountExportPeriod;
  includeSettlementAttachment: boolean;
  maskWalletAddress: boolean;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  walletAddress: string | null;
  overview: Awaited<ReturnType<AccountViewService["getAccountOverviewForUser"]>>;
  preferences: RespondentAccountPreferencesViewModel;
  settlementAttachment: RespondentAccountExportSettlementAttachmentViewModel | null;
};

const ACCOUNT_EXPORT_NAMESPACE = "arena.account.exports";

function parseStoredExports(value: unknown): StoredAccountExportRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is StoredAccountExportRecord =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as { exportId?: unknown }).exportId === "string" &&
            typeof (item as { userId?: unknown }).userId === "string" &&
            typeof (item as { status?: unknown }).status === "string" &&
            typeof (item as { format?: unknown }).format === "string" &&
            typeof (item as { period?: unknown }).period === "string" &&
            typeof (item as { requestedAt?: unknown }).requestedAt === "string" &&
            typeof (item as { completedAt?: unknown }).completedAt === "string" &&
            typeof (item as { fileName?: unknown }).fileName === "string" &&
            "overview" in (item as Record<string, unknown>) &&
            "preferences" in (item as Record<string, unknown>),
        ),
    )
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    );
}

function cloneStoredExports(
  records: StoredAccountExportRecord[],
): StoredAccountExportRecord[] {
  return structuredClone(records);
}

function toExportListItem(
  record: StoredAccountExportRecord,
): RespondentAccountExportItemViewModel {
  return {
    exportId: record.exportId,
    userId: record.userId,
    status: record.status,
    format: record.format,
    period: record.period,
    includeSettlementAttachment: record.includeSettlementAttachment,
    maskWalletAddress: record.maskWalletAddress,
    requestedAt: record.requestedAt,
    completedAt: record.completedAt,
    fileName: record.fileName,
    metrics: {
      rewardCount: record.overview.rewards.length,
      settledResultCount: record.overview.resultOverview.settledResults.totals.settledCount,
      openPositionCount: record.overview.resultOverview.openPositions.totalCount,
    },
  };
}

function toArtifact(
  record: StoredAccountExportRecord,
): RespondentAccountExportArtifactViewModel {
  return {
    exportId: record.exportId,
    userId: record.userId,
    status: record.status,
    format: record.format,
    period: record.period,
    includeSettlementAttachment: record.includeSettlementAttachment,
    maskWalletAddress: record.maskWalletAddress,
    requestedAt: record.requestedAt,
    completedAt: record.completedAt,
    fileName: record.fileName,
    walletAddress: record.walletAddress,
    overview: structuredClone(record.overview),
    preferences: structuredClone(record.preferences),
    settlementAttachment: record.settlementAttachment
      ? structuredClone(record.settlementAttachment)
      : null,
  };
}

@Injectable()
export class AccountExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly accountViews: AccountViewService,
    private readonly accountPreferences: AccountPreferencesService,
  ) {}

  async listAccountExportsForUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentAccountExportListViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );
    const storedExports = parseStoredExports(record?.valueJson ?? null);

    return {
      userId,
      totalCount: storedExports.length,
      items: storedExports.map(toExportListItem),
    };
  }

  async getAccountExportForUser(
    userId: string,
    exportId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentAccountExportArtifactViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );
    const storedExports = parseStoredExports(record?.valueJson ?? null);
    const matched = storedExports.find((item) => item.exportId === exportId) ?? null;

    if (!matched) {
      throw new ArenaNotFoundError(
        "account_export.not_found",
        `Account export ${exportId} was not found`,
      );
    }

    return toArtifact(matched);
  }

  async createAccountExportForUser(
    userId: string,
    input: CreateRespondentAccountExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentAccountExportArtifactViewModel> {
    const [overview, preferences] = await Promise.all([
      this.accountViews.getAccountOverviewForUser(userId),
      this.accountPreferences.getAccountPreferencesForUser(userId, db),
    ]);

    const requestedAt = new Date().toISOString();
    const exportId = this.ids.next("account_export");
    const period = input.format ? preferences.exports.period : preferences.exports.period;
    const walletAddress = preferences.wallet.walletConnected
      ? this.maskWalletAddress(userId, preferences.exports.maskWalletAddress)
      : null;
    const record: StoredAccountExportRecord = {
      exportId,
      userId,
      status: "completed",
      format: input.format ?? "json",
      period,
      includeSettlementAttachment: preferences.exports.includeSettlementAttachment,
      maskWalletAddress: preferences.exports.maskWalletAddress,
      requestedAt,
      completedAt: requestedAt,
      fileName: this.buildFileName(userId, period, requestedAt),
      walletAddress,
      overview,
      preferences,
      settlementAttachment: preferences.exports.includeSettlementAttachment
        ? {
            generatedAt: requestedAt,
            settledResultCount:
              overview.resultOverview.settledResults.totals.settledCount,
            openPositionCount: overview.resultOverview.openPositions.totalCount,
            recentActivityCount: overview.resultOverview.recentActivity.length,
          }
        : null,
    };

    const key = this.buildStorageKey(userId);
    const existing = await this.systemKeyValues.findByKey(key, db);
    const currentRecords = parseStoredExports(existing?.valueJson ?? null);
    const nextRecords = [record, ...currentRecords].slice(0, 20);

    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena account exports for ${userId}`,
        valueJson: cloneStoredExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena account exports for ${userId}`,
        valueJson: cloneStoredExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return toArtifact(record);
  }

  private buildStorageKey(userId: string): string {
    return `${ACCOUNT_EXPORT_NAMESPACE}.${userId}`;
  }

  private buildFileName(
    userId: string,
    period: RespondentAccountExportPeriod,
    requestedAt: string,
  ): string {
    const compactTimestamp = requestedAt.replace(/[:.]/g, "-");
    return `arena-account-${userId}-${period}-${compactTimestamp}.json`;
  }

  private maskWalletAddress(userId: string, mask: boolean): string {
    const normalized = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).padStart(8, "0");
    const full = `wallet_${normalized}`;
    if (!mask) {
      return full;
    }

    const head = full.slice(0, 6);
    const tail = full.slice(-4);
    return `${head}...${tail}`;
  }
}
