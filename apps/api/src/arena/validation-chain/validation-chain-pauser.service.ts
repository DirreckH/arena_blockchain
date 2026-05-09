import { Injectable } from "@nestjs/common";

import {
  ArenaConflictError,
  ArenaValidationError,
} from "../arena.errors";
import { InternalAuditService } from "../services/internal-audit.service";
import type { ValidationChainAdminCommandResult } from "./validation-chain.types";
import {
  VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
  ValidationChainContractError,
} from "./validation-chain.types";
import { ValidationChainContractService } from "./validation-chain-contract.service";

interface ValidationChainPauseInput {
  actorUserId: string;
  reason?: string;
  note?: string;
}

@Injectable()
export class ValidationChainPauserService {
  constructor(
    private readonly contract: ValidationChainContractService,
    private readonly audit: InternalAuditService,
  ) {}

  async pauseValidationChain(
    input: ValidationChainPauseInput,
  ): Promise<ValidationChainAdminCommandResult> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.pause.actor_required",
        "Validation chain pause requires an explicit actor",
      );
    }

    if (await this.contract.isPaused()) {
      throw new ArenaConflictError(
        "validation_chain.pause.already_paused",
        "Validation chain is already paused",
      );
    }

    return this.executeAdminCommand({
      action: "validation_chain.pause",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      send: async () => this.contract.sendPause(),
    });
  }

  async unpauseValidationChain(
    input: ValidationChainPauseInput,
  ): Promise<ValidationChainAdminCommandResult> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.unpause.actor_required",
        "Validation chain unpause requires an explicit actor",
      );
    }

    if (!(await this.contract.isPaused())) {
      throw new ArenaConflictError(
        "validation_chain.unpause.not_paused",
        "Validation chain is not paused",
      );
    }

    return this.executeAdminCommand({
      action: "validation_chain.unpause",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      send: async () => this.contract.sendUnpause(),
    });
  }

  private async executeAdminCommand(input: {
    action: string;
    actorUserId: string;
    reason?: string;
    note?: string;
    send: () => Promise<{ hash: string }>;
  }): Promise<ValidationChainAdminCommandResult> {
    const attemptedAt = new Date();

    try {
      const tx = await input.send();
      await this.audit.record({
        entityType: "validation_chain_contract",
        entityId: this.contract.getContractAddress(),
        action: `${input.action}.submitted`,
        actorUserId: input.actorUserId,
        reason: input.reason ?? VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
        note: input.note,
        metadata: {
          txHash: tx.hash,
          retryable: false,
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });

      return {
        txHash: tx.hash,
        attemptedAt: attemptedAt.toISOString(),
        retryable: false,
        contractAddress: this.contract.getContractAddress(),
      };
    } catch (error) {
      const retryable = isRetryableAdminError(error);
      await this.audit.record({
        entityType: "validation_chain_contract",
        entityId: this.contract.getContractAddress(),
        action: `${input.action}.failed`,
        actorUserId: input.actorUserId,
        reason: input.reason ?? VALIDATION_CHAIN_COMMAND_REASON_SYSTEM,
        note: input.note,
        metadata: {
          retryable,
          error: error instanceof Error ? error.message : String(error),
          lastAttemptedAt: attemptedAt.toISOString(),
        },
      });
      throw error;
    }
  }
}

function isRetryableAdminError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof ArenaConflictError || error instanceof ArenaValidationError) {
    return false;
  }

  if (error instanceof ValidationChainContractError) {
    return /timeout|network|replacement|nonce|underpriced|server error|ECONN/i.test(
      error.message,
    );
  }

  return false;
}
