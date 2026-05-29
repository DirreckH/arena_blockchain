import { Injectable } from "@nestjs/common";

import { ArenaValidationError } from "../arena.errors";
import { InternalAuditService } from "../services/internal-audit.service";
import {
  VALIDATION_CHAIN_STREAM_KEY,
  type ValidationChainSyncSnapshot,
} from "./validation-chain.types";
import { ValidationChainSyncWorker } from "./validation-chain-sync.worker";

interface ValidationChainManualSyncInput {
  actorUserId?: string | null;
  reason: string;
  note?: string;
}

@Injectable()
export class ValidationChainManualSyncService {
  constructor(
    private readonly worker: ValidationChainSyncWorker,
    private readonly audit: InternalAuditService,
  ) {}

  async syncNow(
    input: ValidationChainManualSyncInput,
  ): Promise<ValidationChainSyncSnapshot> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.sync.actor_required",
        "Manual validation chain sync requires an explicit actor",
      );
    }

    try {
      const snapshot = await this.worker.syncOnce();
      await this.audit.record({
        entityType: "validation_chain_stream",
        entityId: snapshot.streamKey,
        action: "validation_chain.sync.manual.completed",
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          latestBlock: snapshot.latestBlock,
          safeToBlock: snapshot.safeToBlock,
          processedEvents: snapshot.processedEvents,
          fromBlock: snapshot.fromBlock,
          toBlock: snapshot.toBlock,
        },
      });

      return snapshot;
    } catch (error) {
      await this.audit.record({
        entityType: "validation_chain_stream",
        entityId: VALIDATION_CHAIN_STREAM_KEY,
        action: "validation_chain.sync.manual.failed",
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
