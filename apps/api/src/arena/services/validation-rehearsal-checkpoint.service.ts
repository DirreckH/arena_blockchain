import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { AppConfigService } from "../../config/app-config.service";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type {
  PropositionValidationRehearsalCheckpointViewModel,
  PropositionValidationRehearsalStepId,
  PropositionValidationRehearsalStepStatus,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { PropositionRepository } from "../repositories/proposition.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

const VALIDATION_REHEARSAL_CHECKPOINT_NAMESPACE =
  "arena.validation.rehearsal_checkpoints";

type StoredValidationRehearsalCheckpointRecord =
  PropositionValidationRehearsalCheckpointViewModel;

const VALIDATION_REHEARSAL_STEP_IDS = new Set<PropositionValidationRehearsalStepId>([
  "preflight",
  "publish_and_open",
  "local_bet_and_sync",
  "freeze_and_resolve",
  "projection_and_settlement",
]);

const VALIDATION_REHEARSAL_STEP_STATUSES =
  new Set<PropositionValidationRehearsalStepStatus>([
    "pending",
    "complete",
    "blocked",
  ]);

const cloneValue = <T>(value: T): T => structuredClone(value);

const parseStoredCheckpoint = (
  value: unknown,
): StoredValidationRehearsalCheckpointRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.propositionId !== "string" ||
    typeof candidate.environment !== "string" ||
    typeof candidate.chainId !== "number" ||
    typeof candidate.stepId !== "string" ||
    typeof candidate.status !== "string" ||
    typeof candidate.reason !== "string" ||
    !Array.isArray(candidate.evidence) ||
    !candidate.evidence.every((item) => typeof item === "string") ||
    (candidate.note !== null && candidate.note !== undefined && typeof candidate.note !== "string") ||
    (candidate.txHash !== null &&
      candidate.txHash !== undefined &&
      typeof candidate.txHash !== "string") ||
    (candidate.blockNumber !== null &&
      candidate.blockNumber !== undefined &&
      typeof candidate.blockNumber !== "number") ||
    (candidate.recordedByUserId !== null &&
      candidate.recordedByUserId !== undefined &&
      typeof candidate.recordedByUserId !== "string") ||
    typeof candidate.recordedAt !== "string"
  ) {
    return null;
  }

  if (
    !VALIDATION_REHEARSAL_STEP_IDS.has(
      candidate.stepId as PropositionValidationRehearsalStepId,
    ) ||
    !VALIDATION_REHEARSAL_STEP_STATUSES.has(
      candidate.status as PropositionValidationRehearsalStepStatus,
    )
  ) {
    return null;
  }

  return {
    propositionId: candidate.propositionId,
    environment: candidate.environment as PropositionValidationRehearsalCheckpointViewModel["environment"],
    chainId: candidate.chainId,
    stepId: candidate.stepId as PropositionValidationRehearsalStepId,
    status: candidate.status as PropositionValidationRehearsalStepStatus,
    reason: candidate.reason,
    note:
      typeof candidate.note === "string" ? candidate.note : null,
    evidence: candidate.evidence as string[],
    txHash: typeof candidate.txHash === "string" ? candidate.txHash : null,
    blockNumber:
      typeof candidate.blockNumber === "number" ? candidate.blockNumber : null,
    recordedByUserId:
      typeof candidate.recordedByUserId === "string"
        ? candidate.recordedByUserId
        : null,
    recordedAt: candidate.recordedAt,
  };
};

@Injectable()
export class ValidationRehearsalCheckpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly config: AppConfigService,
    private readonly propositions: PropositionRepository,
    private readonly systemKeyValues: SystemKeyValueRepository,
  ) {}

  async recordCheckpoint(
    input: {
      propositionId: string;
      stepId: PropositionValidationRehearsalStepId;
      status: PropositionValidationRehearsalStepStatus;
      reason: string;
      note?: string;
      evidence?: string[];
      txHash?: string;
      blockNumber?: number;
      actorUserId?: string | null;
      recordedAt?: string;
    },
    db?: ArenaDbClient,
  ): Promise<PropositionValidationRehearsalCheckpointViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.propositions.findById(input.propositionId, tx);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${input.propositionId} was not found`,
        );
      }

      if (!VALIDATION_REHEARSAL_STEP_IDS.has(input.stepId)) {
        throw new ArenaValidationError(
          "validation_rehearsal_checkpoint.step_invalid",
          `Validation rehearsal step ${input.stepId} is not supported`,
        );
      }

      if (!VALIDATION_REHEARSAL_STEP_STATUSES.has(input.status)) {
        throw new ArenaValidationError(
          "validation_rehearsal_checkpoint.status_invalid",
          `Validation rehearsal checkpoint status ${input.status} is not supported`,
        );
      }

      const record: StoredValidationRehearsalCheckpointRecord = {
        propositionId: input.propositionId,
        environment: this.config.validationEnvironment,
        chainId: this.config.chainId,
        stepId: input.stepId,
        status: input.status,
        reason: input.reason,
        note: input.note ?? null,
        evidence: cloneValue(input.evidence ?? []),
        txHash: input.txHash ?? null,
        blockNumber: input.blockNumber ?? null,
        recordedByUserId: input.actorUserId ?? null,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      };
      const key = this.buildStorageKey(
        input.propositionId,
        input.stepId,
        this.ids.next("validation_rehearsal_checkpoint"),
      );

      await this.systemKeyValues.upsertByKey(
        key,
        {
          id: this.ids.next("system_key_value"),
          key,
          description: `Arena validation rehearsal checkpoint for ${input.propositionId} ${input.stepId}`,
          valueJson: cloneValue(record) as unknown as Prisma.InputJsonValue,
        },
        {
          description: `Arena validation rehearsal checkpoint for ${input.propositionId} ${input.stepId}`,
          valueJson: cloneValue(record) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return cloneValue(record);
    });
  }

  async listCheckpointsForProposition(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<PropositionValidationRehearsalCheckpointViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const records = await this.systemKeyValues.listByKeyPrefix(
        this.buildPropositionPrefix(propositionId),
        tx,
      );

      return records
        .map((record) => parseStoredCheckpoint(record.valueJson))
        .filter(
          (
            record,
          ): record is PropositionValidationRehearsalCheckpointViewModel =>
            record !== null,
        )
        .sort(
          (left, right) =>
            Date.parse(right.recordedAt) - Date.parse(left.recordedAt),
        );
    });
  }

  private buildPropositionPrefix(propositionId: string): string {
    return `${VALIDATION_REHEARSAL_CHECKPOINT_NAMESPACE}.${this.config.validationEnvironment}.${this.config.chainId}.${propositionId}.`;
  }

  private buildStorageKey(
    propositionId: string,
    stepId: PropositionValidationRehearsalStepId,
    checkpointId: string,
  ): string {
    return `${this.buildPropositionPrefix(propositionId)}${stepId}.${checkpointId}`;
  }
}
