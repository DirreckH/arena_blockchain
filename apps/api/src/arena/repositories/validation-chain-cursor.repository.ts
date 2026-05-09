import { Injectable } from "@nestjs/common";
import type {
  Prisma,
  ValidationChainCursor,
  ValidationChainSyncStatus,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";
import type { ValidationChainCursorCheckpointInput } from "../validation-chain/validation-chain.types";

@Injectable()
export class ValidationChainCursorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCursor(
    streamKey: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainCursor | null> {
    return db.validationChainCursor.findUnique({ where: { streamKey } });
  }

  async upsertCursor(
    input: ValidationChainCursorCheckpointInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainCursor> {
    const createData = this.toCreateData(input);
    const updateData = this.toUpdateData(input);

    return db.validationChainCursor.upsert({
      where: { streamKey: input.streamKey },
      create: createData,
      update: updateData,
    });
  }

  async updateProcessedCheckpoint(
    streamKey: string,
    checkpoint: {
      lastProcessedBlock: number;
      lastProcessedTxHash?: string | null;
      lastProcessedLogIndex?: number | null;
      syncStatus?: ValidationChainSyncStatus;
    },
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainCursor> {
    return db.validationChainCursor.update({
      where: { streamKey },
      data: {
        lastProcessedBlock: checkpoint.lastProcessedBlock,
        lastProcessedTxHash: checkpoint.lastProcessedTxHash,
        lastProcessedLogIndex: checkpoint.lastProcessedLogIndex,
        syncStatus: checkpoint.syncStatus,
      },
    });
  }

  async updateFinalizedBlock(
    streamKey: string,
    lastFinalizedBlock: number,
    syncStatus?: ValidationChainSyncStatus,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainCursor> {
    return db.validationChainCursor.update({
      where: { streamKey },
      data: {
        lastFinalizedBlock,
        syncStatus,
      },
    });
  }

  private toCreateData(
    input: ValidationChainCursorCheckpointInput,
  ): Prisma.ValidationChainCursorCreateInput {
    return {
      streamKey: input.streamKey,
      chainId: input.chainId,
      contractAddress: input.contractAddress,
      lastProcessedBlock: input.lastProcessedBlock ?? null,
      lastProcessedTxHash: input.lastProcessedTxHash ?? null,
      lastProcessedLogIndex: input.lastProcessedLogIndex ?? null,
      lastFinalizedBlock: input.lastFinalizedBlock ?? null,
      syncStatus: input.syncStatus ?? "idle",
    };
  }

  private toUpdateData(
    input: ValidationChainCursorCheckpointInput,
  ): Prisma.ValidationChainCursorUpdateInput {
    const data: Prisma.ValidationChainCursorUpdateInput = {
      chainId: input.chainId,
      contractAddress: input.contractAddress,
      syncStatus: input.syncStatus ?? "idle",
    };

    if (input.lastProcessedBlock !== undefined) {
      data.lastProcessedBlock = input.lastProcessedBlock;
    }
    if (input.lastProcessedTxHash !== undefined) {
      data.lastProcessedTxHash = input.lastProcessedTxHash;
    }
    if (input.lastProcessedLogIndex !== undefined) {
      data.lastProcessedLogIndex = input.lastProcessedLogIndex;
    }
    if (input.lastFinalizedBlock !== undefined) {
      data.lastFinalizedBlock = input.lastFinalizedBlock;
    }

    return data;
  }
}
