import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type { ValidationChainCommandSubmissionViewModel } from "../internal-ops.types";
import { MarketRepository } from "../repositories/market.repository";
import { AppQueueService } from "../../queue/queue.service";
import {
  ValidationChainContractError,
  ValidationContractMarketState,
  type ValidationChainCommandJobPayload,
} from "./validation-chain.types";
import { ValidationChainAlertService } from "./validation-chain-alert.service";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";
import { ValidationChainOperatorCommandService } from "./validation-chain-operator-command.service";
import { ValidationChainOracleService } from "./validation-chain-oracle.service";
import { ValidationRehearsalCheckpointService } from "../services/validation-rehearsal-checkpoint.service";
import type { ValidationChainCommandResult } from "./validation-chain.types";

const OPEN_MARKET_DELAY_MS = 5_000;
const RESOLVE_MARKET_DELAY_MS = 5_000;

type CommandDisposition = "retryable" | "terminal" | "noop";

@Injectable()
export class ValidationChainCommandRuntimeService {
  constructor(
    private readonly queue: AppQueueService,
    private readonly markets: MarketRepository,
    private readonly ids: ValidationChainIdService,
    private readonly contract: ValidationChainContractService,
    private readonly operator: ValidationChainOperatorCommandService,
    private readonly oracle: ValidationChainOracleService,
    private readonly alerts: ValidationChainAlertService,
    private readonly rehearsalCheckpoints: ValidationRehearsalCheckpointService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ValidationChainCommandRuntimeService.name);
  }

  async enqueueCreateOpenCommands(input: {
    propositionId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<ValidationChainCommandSubmissionViewModel[]> {
    const createSubmission = await this.enqueueCommand({
      command: "create_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: 0,
    });
    const openSubmission = await this.enqueueCommand({
      command: "open_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: OPEN_MARKET_DELAY_MS,
    });

    return [createSubmission, openSubmission];
  }

  async enqueueFreezeCommand(input: {
    propositionId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<ValidationChainCommandSubmissionViewModel> {
    return this.enqueueCommand({
      command: "freeze_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: 0,
    });
  }

  async enqueueResolveCommand(input: {
    propositionId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<ValidationChainCommandSubmissionViewModel> {
    return this.enqueueCommand({
      command: "resolve_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: RESOLVE_MARKET_DELAY_MS,
    });
  }

  async executeQueuedCommand(
    payload: ValidationChainCommandJobPayload,
  ): Promise<void> {
    let result: ValidationChainCommandResult;

    try {
      result = await this.executeCommand(payload);
    } catch (error) {
      const disposition = await this.classifyError(payload.command, payload.propositionId, error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (disposition === "retryable") {
        throw error;
      }

      if (disposition === "noop") {
        await this.alerts.recordCommandSkipped({
          propositionId: payload.propositionId,
          command: payload.command,
          actorUserId: payload.actorUserId,
          reason: payload.reason,
          note: payload.note,
          error: errorMessage,
        });
        return;
      }

      await this.alerts.recordCommandTerminal({
        propositionId: payload.propositionId,
        command: payload.command,
        actorUserId: payload.actorUserId,
        reason: payload.reason,
        note: payload.note,
        error: errorMessage,
      });
      return;
    }

    await this.recordAutomaticRehearsalCheckpoint(payload, result);
  }

  private async enqueueCommand(input: Omit<
    ValidationChainCommandJobPayload,
    "requestedAt"
  > & { delayMs: number }): Promise<ValidationChainCommandSubmissionViewModel> {
    try {
      const job = await this.queue.enqueueValidationChainCommand(
        {
          command: input.command,
          propositionId: input.propositionId,
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          requestedAt: new Date().toISOString(),
        },
        {
          delay: input.delayMs,
        },
      );

      if (job.dedupeStatus === "already_pending") {
        await this.alerts.recordCommandAlreadyPending({
          propositionId: input.propositionId,
          command: input.command,
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          queueJobId: job.jobId,
          delayMs: input.delayMs,
        });

        return {
          command: input.command,
          status: "already_pending",
          queueJobId: job.jobId,
          delayMs: input.delayMs,
          errorMessage: null,
        };
      }

      await this.alerts.recordCommandEnqueued({
        propositionId: input.propositionId,
        command: input.command,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        queueJobId: job.jobId,
        delayMs: input.delayMs,
      });

      return {
        command: input.command,
        status: "enqueued",
        queueJobId: job.jobId,
        delayMs: input.delayMs,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.alerts.recordCommandTerminal({
        propositionId: input.propositionId,
        command: input.command,
        actorUserId: input.actorUserId,
        reason: `${input.reason}.enqueue_failed`,
        note: input.note,
        error: errorMessage,
      });
      this.logger.error(
        {
          propositionId: input.propositionId,
          command: input.command,
          error: errorMessage,
        },
        "Failed to enqueue validation-chain command",
      );

      return {
        command: input.command,
        status: "failed",
        queueJobId: null,
        delayMs: input.delayMs,
        errorMessage,
      };
    }
  }

  private async executeCommand(
    payload: ValidationChainCommandJobPayload,
  ): Promise<ValidationChainCommandResult> {
    switch (payload.command) {
      case "create_market":
        return this.operator.createMarket(payload);
      case "open_market":
        return this.operator.openMarket(payload);
      case "freeze_market":
        return this.operator.freezeMarket(payload);
      case "resolve_market":
        return this.oracle.resolveMarket(payload);
    }
  }

  private async recordAutomaticRehearsalCheckpoint(
    payload: ValidationChainCommandJobPayload,
    result: ValidationChainCommandResult,
  ): Promise<void> {
    const automaticCheckpoint = AUTOMATIC_REHEARSAL_CHECKPOINT_BY_COMMAND[payload.command];

    try {
      await this.rehearsalCheckpoints.recordCheckpoint({
        propositionId: result.propositionId,
        stepId: automaticCheckpoint.stepId,
        status: "complete",
        reason: automaticCheckpoint.reason,
        note: payload.note,
        evidence: [
          `command=${payload.command}`,
          `marketId=${result.marketId}`,
          `chainMarketId=${result.chainMarketId}`,
          `chainPropositionId=${result.chainPropositionId}`,
          `attemptedAt=${result.attemptedAt}`,
        ],
        txHash: result.txHash,
        actorUserId: payload.actorUserId,
        recordedAt: result.attemptedAt,
      });
    } catch (error) {
      this.logger.warn(
        {
          propositionId: payload.propositionId,
          command: payload.command,
          txHash: result.txHash,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to persist validation rehearsal checkpoint after successful queued command",
      );
    }
  }

  private async classifyError(
    command: ValidationChainCommandJobPayload["command"],
    propositionId: string,
    error: unknown,
  ): Promise<CommandDisposition> {
    if (error instanceof ValidationChainContractError) {
      return /timeout|network|replacement|nonce|underpriced|server error|ECONN/i.test(
        error.message,
      )
        ? "retryable"
        : "terminal";
    }

    if (error instanceof ArenaNotFoundError || error instanceof ArenaValidationError) {
      return "terminal";
    }

    if (!(error instanceof ArenaConflictError)) {
      return "terminal";
    }

    if (command === "create_market") {
      return error.code === "validation_chain.create.already_projected" ||
        error.code === "validation_chain.create.already_exists"
        ? "noop"
        : "terminal";
    }

    if (command === "open_market") {
      if (error.code === "validation_chain.market_not_created") {
        return "retryable";
      }

      if (error.code === "validation_chain.open.invalid_state") {
        const state = await this.getOnChainState(propositionId);
        return state === null || state === ValidationContractMarketState.PreLive
          ? "retryable"
          : "noop";
      }

      return "terminal";
    }

    if (command === "freeze_market") {
      if (error.code === "validation_chain.market_not_created") {
        return "retryable";
      }

      if (error.code === "validation_chain.freeze.invalid_state") {
        const state = await this.getOnChainState(propositionId);
        return state === null ||
          state === ValidationContractMarketState.PreLive ||
          state === ValidationContractMarketState.Live
          ? "retryable"
          : "noop";
      }

      return "terminal";
    }

    if (error.code === "validation_chain.resolve.market_not_created") {
      return "retryable";
    }

    if (
      error.code === "validation_chain.resolve.already_resolved" ||
      error.code === "validation_chain.resolve.cancelled"
    ) {
      return "noop";
    }

    if (error.code === "validation_chain.resolve.invalid_state") {
      const state = await this.getOnChainState(propositionId);
      return state === null ||
        state === ValidationContractMarketState.PreLive ||
        state === ValidationContractMarketState.Live
        ? "retryable"
        : "noop";
    }

    return "terminal";
  }

  private async getOnChainState(
    propositionId: string,
  ): Promise<ValidationContractMarketState | null> {
    const market = await this.markets.findByPropositionId(propositionId);
    if (!market) {
      return null;
    }

    const chainMarketId =
      market.chainMarketId ?? this.ids.buildChainMarketId(market.id);
    const onChainMarket = await this.contract.getMarketOrNull(chainMarketId);
    return onChainMarket?.state ?? null;
  }
}

const AUTOMATIC_REHEARSAL_CHECKPOINT_BY_COMMAND = {
  create_market: {
    stepId: "publish_and_open",
    reason: "validation_rehearsal.auto.create_market_submitted",
  },
  open_market: {
    stepId: "publish_and_open",
    reason: "validation_rehearsal.auto.open_market_submitted",
  },
  freeze_market: {
    stepId: "freeze_and_resolve",
    reason: "validation_rehearsal.auto.freeze_market_submitted",
  },
  resolve_market: {
    stepId: "freeze_and_resolve",
    reason: "validation_rehearsal.auto.resolve_market_submitted",
  },
} as const;
