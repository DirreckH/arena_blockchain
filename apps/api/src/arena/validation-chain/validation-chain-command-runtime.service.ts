import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
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
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ValidationChainCommandRuntimeService.name);
  }

  async enqueueCreateOpenCommands(input: {
    propositionId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<void> {
    await this.enqueueCommand({
      command: "create_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: 0,
    });
    await this.enqueueCommand({
      command: "open_market",
      propositionId: input.propositionId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      delayMs: OPEN_MARKET_DELAY_MS,
    });
  }

  async enqueueFreezeCommand(input: {
    propositionId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<void> {
    await this.enqueueCommand({
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
  }): Promise<void> {
    await this.enqueueCommand({
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
    try {
      await this.executeCommand(payload);
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
    }
  }

  private async enqueueCommand(input: Omit<
    ValidationChainCommandJobPayload,
    "requestedAt"
  > & { delayMs: number }): Promise<void> {
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

      await this.alerts.recordCommandEnqueued({
        propositionId: input.propositionId,
        command: input.command,
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        queueJobId: job.jobId,
        delayMs: input.delayMs,
      });
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
    }
  }

  private async executeCommand(
    payload: ValidationChainCommandJobPayload,
  ): Promise<void> {
    switch (payload.command) {
      case "create_market":
        await this.operator.createMarket(payload);
        return;
      case "open_market":
        await this.operator.openMarket(payload);
        return;
      case "freeze_market":
        await this.operator.freezeMarket(payload);
        return;
      case "resolve_market":
        await this.oracle.resolveMarket(payload);
        return;
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
