import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import type {
  BackendValidationProofRecordViewModel,
  BackendValidationRehearsalStepId,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

const VALIDATION_PROOF_RECORD_NAMESPACE = "arena.validation.proof_record";

type StoredValidationProofRecord = BackendValidationProofRecordViewModel;

const VALIDATION_STEP_IDS = new Set<BackendValidationRehearsalStepId>([
  "preflight",
  "publish_and_open",
  "local_bet_and_sync",
  "freeze_and_resolve",
  "projection_and_settlement",
]);

const VALIDATION_STEP_STATUSES = new Set<"complete" | "blocked" | "pending">([
  "complete",
  "blocked",
  "pending",
]);

const cloneValue = <T>(value: T): T => structuredClone(value);

const normalizeRewardPayoutStatusCounts = (
  value: unknown,
): StoredValidationProofRecord["rewardPayoutStatusCounts"] => {
  const candidate = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const asCount = (field: string): number =>
    typeof candidate[field] === "number" && Number.isFinite(candidate[field])
      ? candidate[field]
      : 0;

  return {
    requested: asCount("requested"),
    approved: asCount("approved"),
    executing: asCount("executing"),
    completed: asCount("completed"),
    failed: asCount("failed"),
    cancelled: asCount("cancelled"),
    none: asCount("none"),
  };
};

const parseStepId = (
  value: unknown,
): BackendValidationRehearsalStepId | null => {
  if (typeof value !== "string" || !VALIDATION_STEP_IDS.has(value as BackendValidationRehearsalStepId)) {
    return null;
  }

  return value as BackendValidationRehearsalStepId;
};

const parseStepStatus = (
  value: unknown,
): "complete" | "blocked" | "pending" | null => {
  if (typeof value !== "string" || !VALIDATION_STEP_STATUSES.has(value as "complete" | "blocked" | "pending")) {
    return null;
  }

  return value as "complete" | "blocked" | "pending";
};

const parseStoredRecord = (
  value: unknown,
): StoredValidationProofRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.environment !== "string" ||
    typeof candidate.chainId !== "number" ||
    typeof candidate.propositionId !== "string" ||
    typeof candidate.proofComplete !== "boolean" ||
    !Array.isArray(candidate.failures) ||
    !candidate.failures.every((item) => typeof item === "string") ||
    typeof candidate.releaseReadinessStatus !== "string" ||
    !Array.isArray(candidate.releaseBlockingDependencies) ||
    !candidate.releaseBlockingDependencies.every((item) => typeof item === "string") ||
    typeof candidate.validationRehearsalStatus !== "string" ||
    typeof candidate.completedStepCount !== "number" ||
    typeof candidate.remainingStepCount !== "number" ||
    typeof candidate.publicSettledResultVisible !== "boolean" ||
    typeof candidate.publicIntegrityOverviewVisible !== "boolean" ||
    typeof candidate.checkedAt !== "string" ||
    typeof candidate.recordedAt !== "string"
  ) {
    return null;
  }

  const validationCurrentStepId = parseStepId(candidate.validationCurrentStepId);
  const latestCheckpointStepId = parseStepId(candidate.latestCheckpointStepId);
  const validationCurrentStepStatus = parseStepStatus(candidate.validationCurrentStepStatus);
  const latestCheckpointStatus = parseStepStatus(candidate.latestCheckpointStatus);

  return {
    environment: candidate.environment as StoredValidationProofRecord["environment"],
    chainId: candidate.chainId,
    propositionId: candidate.propositionId,
    proofComplete: candidate.proofComplete,
    failures: cloneValue(candidate.failures as string[]),
    releaseReadinessStatus: candidate.releaseReadinessStatus as StoredValidationProofRecord["releaseReadinessStatus"],
    releaseBlockingDependencies: cloneValue(candidate.releaseBlockingDependencies as string[]),
    validationRehearsalStatus:
      candidate.validationRehearsalStatus as StoredValidationProofRecord["validationRehearsalStatus"],
    validationCurrentStepId,
    validationCurrentStepStatus,
    completedStepCount: candidate.completedStepCount,
    remainingStepCount: candidate.remainingStepCount,
    latestCheckpointStepId,
    latestCheckpointStatus,
    latestCheckpointAt:
      typeof candidate.latestCheckpointAt === "string" ? candidate.latestCheckpointAt : null,
    publicSettledResultVisible: candidate.publicSettledResultVisible,
    publicIntegrityOverviewVisible: candidate.publicIntegrityOverviewVisible,
    rewardPayoutLedgerEntryCount:
      typeof candidate.rewardPayoutLedgerEntryCount === "number"
        ? candidate.rewardPayoutLedgerEntryCount
        : 0,
    rewardPayoutRecordCount:
      typeof candidate.rewardPayoutRecordCount === "number"
        ? candidate.rewardPayoutRecordCount
        : 0,
    rewardPayoutFinalizedWithoutPayoutCount:
      typeof candidate.rewardPayoutFinalizedWithoutPayoutCount === "number"
        ? candidate.rewardPayoutFinalizedWithoutPayoutCount
        : 0,
    rewardPayoutExecutingWithoutTxHashCount:
      typeof candidate.rewardPayoutExecutingWithoutTxHashCount === "number"
        ? candidate.rewardPayoutExecutingWithoutTxHashCount
        : 0,
    rewardPayoutStaleExecutingCount:
      typeof candidate.rewardPayoutStaleExecutingCount === "number"
        ? candidate.rewardPayoutStaleExecutingCount
        : 0,
    rewardPayoutStaleExecutingWithoutTxHashCount:
      typeof candidate.rewardPayoutStaleExecutingWithoutTxHashCount === "number"
        ? candidate.rewardPayoutStaleExecutingWithoutTxHashCount
        : 0,
    rewardPayoutStaleExecutingAwaitingConfirmationCount:
      typeof candidate.rewardPayoutStaleExecutingAwaitingConfirmationCount === "number"
        ? candidate.rewardPayoutStaleExecutingAwaitingConfirmationCount
        : 0,
    rewardPayoutCompletedWithExecutionTxHashCount:
      typeof candidate.rewardPayoutCompletedWithExecutionTxHashCount === "number"
        ? candidate.rewardPayoutCompletedWithExecutionTxHashCount
        : 0,
    rewardPayoutStatusCounts: normalizeRewardPayoutStatusCounts(
      candidate.rewardPayoutStatusCounts,
    ),
    summaryArtifactPath:
      typeof candidate.summaryArtifactPath === "string" ? candidate.summaryArtifactPath : null,
    evidenceArtifactPath:
      typeof candidate.evidenceArtifactPath === "string" ? candidate.evidenceArtifactPath : null,
    publicResultArtifactPath:
      typeof candidate.publicResultArtifactPath === "string"
        ? candidate.publicResultArtifactPath
        : null,
    rewardPayoutArtifactPath:
      typeof candidate.rewardPayoutArtifactPath === "string"
        ? candidate.rewardPayoutArtifactPath
        : null,
    publicIntegrityArtifactPath:
      typeof candidate.publicIntegrityArtifactPath === "string"
        ? candidate.publicIntegrityArtifactPath
        : null,
    note: typeof candidate.note === "string" ? candidate.note : null,
    recordedByUserId:
      typeof candidate.recordedByUserId === "string" ? candidate.recordedByUserId : null,
    checkedAt: candidate.checkedAt,
    recordedAt: candidate.recordedAt,
  };
};

@Injectable()
export class ValidationProofRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly config: AppConfigService,
    private readonly systemKeyValues: SystemKeyValueRepository,
  ) {}

  async recordProof(
    input: {
      propositionId: string;
      proofComplete: boolean;
      failures: string[];
      releaseReadinessStatus: "ready" | "blocked" | "unknown";
      releaseBlockingDependencies: string[];
      validationRehearsalStatus: "ready" | "blocked" | "unknown";
      validationCurrentStepId?: BackendValidationRehearsalStepId | null;
      validationCurrentStepStatus?: "complete" | "blocked" | "pending" | null;
      completedStepCount?: number;
      remainingStepCount?: number;
      latestCheckpointStepId?: BackendValidationRehearsalStepId | null;
      latestCheckpointStatus?: "complete" | "blocked" | "pending" | null;
      latestCheckpointAt?: string | null;
      publicSettledResultVisible?: boolean;
      publicIntegrityOverviewVisible?: boolean;
      rewardPayoutLedgerEntryCount?: number;
      rewardPayoutRecordCount?: number;
      rewardPayoutFinalizedWithoutPayoutCount?: number;
      rewardPayoutExecutingWithoutTxHashCount?: number;
      rewardPayoutStaleExecutingCount?: number;
      rewardPayoutStaleExecutingWithoutTxHashCount?: number;
      rewardPayoutStaleExecutingAwaitingConfirmationCount?: number;
      rewardPayoutCompletedWithExecutionTxHashCount?: number;
      rewardPayoutStatusCounts?: Partial<
        StoredValidationProofRecord["rewardPayoutStatusCounts"]
      > | null;
      summaryArtifactPath?: string | null;
      evidenceArtifactPath?: string | null;
      publicResultArtifactPath?: string | null;
      rewardPayoutArtifactPath?: string | null;
      publicIntegrityArtifactPath?: string | null;
      note?: string | null;
      actorUserId?: string | null;
      checkedAt?: string;
      recordedAt?: string;
    },
    db?: ArenaDbClient,
  ): Promise<BackendValidationProofRecordViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const record: StoredValidationProofRecord = {
        environment: this.config.validationEnvironment,
        chainId: this.config.chainId,
        propositionId: input.propositionId,
        proofComplete: input.proofComplete,
        failures: cloneValue(input.failures),
        releaseReadinessStatus: input.releaseReadinessStatus,
        releaseBlockingDependencies: cloneValue(input.releaseBlockingDependencies),
        validationRehearsalStatus: input.validationRehearsalStatus,
        validationCurrentStepId: input.validationCurrentStepId ?? null,
        validationCurrentStepStatus: input.validationCurrentStepStatus ?? null,
        completedStepCount: input.completedStepCount ?? 0,
        remainingStepCount: input.remainingStepCount ?? 0,
        latestCheckpointStepId: input.latestCheckpointStepId ?? null,
        latestCheckpointStatus: input.latestCheckpointStatus ?? null,
        latestCheckpointAt: input.latestCheckpointAt ?? null,
        publicSettledResultVisible: input.publicSettledResultVisible ?? false,
        publicIntegrityOverviewVisible: input.publicIntegrityOverviewVisible ?? false,
        rewardPayoutLedgerEntryCount: input.rewardPayoutLedgerEntryCount ?? 0,
        rewardPayoutRecordCount: input.rewardPayoutRecordCount ?? 0,
        rewardPayoutFinalizedWithoutPayoutCount:
          input.rewardPayoutFinalizedWithoutPayoutCount ?? 0,
        rewardPayoutExecutingWithoutTxHashCount:
          input.rewardPayoutExecutingWithoutTxHashCount ?? 0,
        rewardPayoutStaleExecutingCount:
          input.rewardPayoutStaleExecutingCount ?? 0,
        rewardPayoutStaleExecutingWithoutTxHashCount:
          input.rewardPayoutStaleExecutingWithoutTxHashCount ?? 0,
        rewardPayoutStaleExecutingAwaitingConfirmationCount:
          input.rewardPayoutStaleExecutingAwaitingConfirmationCount ?? 0,
        rewardPayoutCompletedWithExecutionTxHashCount:
          input.rewardPayoutCompletedWithExecutionTxHashCount ?? 0,
        rewardPayoutStatusCounts: normalizeRewardPayoutStatusCounts(
          input.rewardPayoutStatusCounts ?? null,
        ),
        summaryArtifactPath: input.summaryArtifactPath ?? null,
        evidenceArtifactPath: input.evidenceArtifactPath ?? null,
        publicResultArtifactPath: input.publicResultArtifactPath ?? null,
        rewardPayoutArtifactPath: input.rewardPayoutArtifactPath ?? null,
        publicIntegrityArtifactPath: input.publicIntegrityArtifactPath ?? null,
        note: input.note ?? null,
        recordedByUserId: input.actorUserId ?? null,
        checkedAt: input.checkedAt ?? new Date().toISOString(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      };
      const key = this.buildStorageKey();

      await this.systemKeyValues.upsertByKey(
        key,
        {
          id: this.ids.next("system_key_value"),
          key,
          description: `Arena validation proof record for ${record.environment}/${record.chainId}`,
          valueJson: cloneValue(record) as unknown as Prisma.InputJsonValue,
        },
        {
          description: `Arena validation proof record for ${record.environment}/${record.chainId}`,
          valueJson: cloneValue(record) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return cloneValue(record);
    });
  }

  async getLatestProof(
    db?: ArenaDbClient,
  ): Promise<BackendValidationProofRecordViewModel | null> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const record = await this.systemKeyValues.findByKey(this.buildStorageKey(), tx);
      return parseStoredRecord(record?.valueJson ?? null);
    });
  }

  private buildStorageKey(): string {
    return `${VALIDATION_PROOF_RECORD_NAMESPACE}.${this.config.validationEnvironment}.${this.config.chainId}`;
  }
}
