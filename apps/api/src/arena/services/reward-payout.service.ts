import { Injectable } from "@nestjs/common";
import type { RewardPayout } from "@prisma/client";
import { ethers } from "ethers";

import { PrismaService } from "../../database/prisma.service";
import { AppConfigService } from "../../config/app-config.service";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import { toDate } from "../arena.utils";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";
import { RewardPayoutRepository } from "../repositories/reward-payout.repository";
import { ArenaUserRepository } from "../repositories/arena-user.repository";
import { RewardPayoutExecutionService } from "./reward-payout-execution.service";

@Injectable()
export class RewardPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly ids: ArenaIdService,
    private readonly ledgers: RewardLedgerRepository,
    private readonly payouts: RewardPayoutRepository,
    private readonly users: ArenaUserRepository,
    private readonly execution: RewardPayoutExecutionService,
  ) {}

  async ensurePayoutForLedger(
    ledgerId: string,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(ledgerId, tx);
      const existing = await this.payouts.findByLedgerId(ledger.id, tx);
      if (existing) {
        return existing;
      }

      if (ledger.status !== "finalized") {
        throw new ArenaValidationError(
          "reward_payout.ledger_not_finalized",
          "Reward payouts can only be created for finalized reward ledgers",
        );
      }

      const user = await this.getRequiredUserWithWallet(ledger.userId, tx);
      const amount = ledger.finalAmount ?? ledger.pendingAmount;
      if (!amount || amount === "0") {
        throw new ArenaValidationError(
          "reward_payout.invalid_amount",
          "Reward payouts require a non-zero finalized amount",
        );
      }

      return this.payouts.create(
        {
          id: this.ids.next("reward_payout"),
          ledgerId: ledger.id,
          userId: ledger.userId,
          method: "wallet_transfer",
          status: "requested",
          assetSymbol: this.config.rewardPayoutAssetSymbol,
          chainId: this.config.chainId,
          amount,
          destinationAddress: user.primaryWalletAddress,
          requestedAt: ledger.finalizedAt ?? ledger.createdAt,
        },
        tx,
      );
    });
  }

  async listByUser(userId: string, db?: ArenaDbClient) {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.payouts.listByUser(userId, tx),
    );
  }

  async getByLedgerId(ledgerId: string, db?: ArenaDbClient) {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.payouts.findByLedgerId(ledgerId, tx),
    );
  }

  async backfillMissingPayoutsForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RewardPayout[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledgers = await this.ledgers.list(
        {
          userId,
          status: "finalized",
          sourceType: "response",
        },
        tx,
      );
      const created: RewardPayout[] = [];

      for (const ledger of ledgers) {
        const amount = ledger.finalAmount ?? ledger.pendingAmount;
        if (!amount || amount === "0") {
          continue;
        }

        const existing = await this.payouts.findByLedgerId(ledger.id, tx);
        if (existing) {
          continue;
        }

        created.push(await this.ensurePayoutForLedger(ledger.id, tx));
      }

      return created;
    });
  }

  async approvePayout(
    input: {
      payoutId: string;
      actorUserId: string;
      approvedAt: string;
    },
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.ensureActorUserExists(input.actorUserId, tx);
      const payout = await this.getRequiredPayout(input.payoutId, tx);
      if (payout.status !== "requested" && payout.status !== "failed") {
        throw new ArenaValidationError(
          "reward_payout.invalid_approval_state",
          "Only requested or failed reward payouts can be approved",
        );
      }

      return this.payouts.update(
        payout.id,
        {
          status: "approved",
          approvedAt: toDate(input.approvedAt),
          approvedByUserId: input.actorUserId,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        tx,
      );
    });
  }

  async startExecution(
    input: {
      payoutId: string;
      startedAt: string;
    },
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const payout = await this.getRequiredPayout(input.payoutId, tx);
      if (payout.status !== "approved" && payout.status !== "failed") {
        throw new ArenaValidationError(
          "reward_payout.invalid_execution_state",
          "Only approved or failed reward payouts can enter execution",
        );
      }

      return this.payouts.update(
        payout.id,
        {
          status: "executing",
          executionStartedAt: toDate(input.startedAt),
          executionTxHash: null,
          externalReference: null,
          retryCount:
            payout.status === "failed" || payout.failedAt !== null
              ? payout.retryCount + 1
              : payout.retryCount,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        tx,
      );
    });
  }

  async executePayout(
    input: {
      payoutId: string;
      startedAt: string;
    },
    db?: ArenaDbClient,
  ): Promise<RewardPayout> {
    const executing = await this.startExecution(input, db);
    let result: Awaited<
      ReturnType<RewardPayoutExecutionService["executeWalletTransfer"]>
    >;

    try {
      result = await this.execution.executeWalletTransfer(executing);
    } catch (error) {
      return this.failPayout(
        {
          payoutId: executing.id,
          failedAt: input.startedAt,
          errorCode: this.getExecutionErrorCode(error),
          errorMessage: this.getExecutionErrorMessage(error),
        },
        db,
      );
    }

    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.payouts.update(
        executing.id,
        {
          executionTxHash: result.executionTxHash,
          externalReference: result.externalReference,
          executionStartedAt:
            executing.executionStartedAt ?? toDate(input.startedAt),
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        tx,
      ),
    );
  }

  async completePayout(
    input: {
      payoutId: string;
      completedAt: string;
      executionTxHash?: string;
      externalReference?: string;
    },
    db?: ArenaDbClient,
  ) {
    const payout = await withArenaTransaction(this.prisma, db, async (tx) =>
      this.getRequiredPayout(input.payoutId, tx),
    );

    if (payout.status !== "executing" && payout.status !== "approved") {
      throw new ArenaValidationError(
        "reward_payout.invalid_completion_state",
        "Only approved or executing reward payouts can complete",
      );
    }

    const resolvedExecutionTxHash =
      input.executionTxHash ?? payout.executionTxHash;

    if (payout.method === "wallet_transfer") {
      if (!resolvedExecutionTxHash) {
        throw new ArenaValidationError(
          "reward_payout.execution_tx_hash_required",
          "Wallet transfer payouts require an execution transaction hash before completion",
        );
      }

      if (!ethers.utils.isHexString(resolvedExecutionTxHash, 32)) {
        throw new ArenaValidationError(
          "reward_payout.invalid_execution_tx_hash",
          "Reward payout execution transaction hash must be a 32-byte hex value",
        );
      }

      await this.execution.verifyWalletTransfer({
        method: payout.method,
        chainId: payout.chainId,
        amount: payout.amount,
        destinationAddress: payout.destinationAddress,
        assetSymbol: payout.assetSymbol,
        executionTxHash: resolvedExecutionTxHash,
      });
    }

    return withArenaTransaction(this.prisma, db, async (tx) => {
      const currentPayout = await this.getRequiredPayout(input.payoutId, tx);
      if (
        currentPayout.status !== "executing" &&
        currentPayout.status !== "approved"
      ) {
        throw new ArenaValidationError(
          "reward_payout.invalid_completion_state",
          "Only approved or executing reward payouts can complete",
        );
      }

      return this.payouts.update(
        currentPayout.id,
        {
          status: "completed",
          completedAt: toDate(input.completedAt),
          executionStartedAt:
            currentPayout.executionStartedAt ?? toDate(input.completedAt),
          executionTxHash: resolvedExecutionTxHash ?? null,
          externalReference: input.externalReference ?? null,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        tx,
      );
    });
  }

  async failPayout(
    input: {
      payoutId: string;
      failedAt: string;
      errorCode: string;
      errorMessage: string;
    },
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const payout = await this.getRequiredPayout(input.payoutId, tx);
      if (payout.status !== "approved" && payout.status !== "executing") {
        throw new ArenaValidationError(
          "reward_payout.invalid_failure_state",
          "Only approved or executing reward payouts can fail",
        );
      }

      return this.payouts.update(
        payout.id,
        {
          status: "failed",
          failedAt: toDate(input.failedAt),
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
        },
        tx,
      );
    });
  }

  async cancelPayoutForLedger(
    input: {
      ledgerId: string;
      cancelledAt: string;
      reasonCode: string;
      reasonMessage: string;
    },
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const payout = await this.payouts.findByLedgerId(input.ledgerId, tx);
      if (!payout) {
        return null;
      }

      if (payout.status === "completed" || payout.status === "cancelled") {
        return payout;
      }

      return this.payouts.update(
        payout.id,
        {
          status: "cancelled",
          cancelledAt: toDate(input.cancelledAt),
          lastErrorCode: input.reasonCode,
          lastErrorMessage: input.reasonMessage,
        },
        tx,
      );
    });
  }

  private async getRequiredLedger(ledgerId: string, db: ArenaDbClient) {
    const ledger = await this.ledgers.findById(ledgerId, db);
    if (!ledger) {
      throw new ArenaNotFoundError(
        "reward_ledger.not_found",
        `Reward ledger ${ledgerId} was not found`,
      );
    }

    return ledger;
  }

  private async getRequiredPayout(payoutId: string, db: ArenaDbClient) {
    const payout = await this.payouts.findById(payoutId, db);
    if (!payout) {
      throw new ArenaNotFoundError(
        "reward_payout.not_found",
        `Reward payout ${payoutId} was not found`,
      );
    }

    return payout;
  }

  private async getRequiredUserWithWallet(userId: string, db: ArenaDbClient) {
    const [user] = await this.users.findByIds([userId], db);
    if (!user) {
      throw new ArenaNotFoundError(
        "user.not_found",
        `User ${userId} was not found`,
      );
    }

    if (!user.primaryWalletAddress) {
      throw new ArenaValidationError(
        "reward_payout.destination_missing",
        "Reward payout requires the user to have a primary wallet address",
      );
    }

    return user;
  }

  private async ensureActorUserExists(userId: string, db: ArenaDbClient) {
    const existing = await this.users.findById(userId, db);
    if (existing) {
      return existing;
    }

    return this.users.create(
      {
        id: userId,
        primaryWalletAddress: null,
        normalizedPrimaryWalletAddress: null,
        status: "active",
      },
      db,
    );
  }

  private getExecutionErrorCode(error: unknown): string {
    if (error instanceof ArenaValidationError) {
      return error.code;
    }

    if (error instanceof Error && error.name.trim().length > 0) {
      return error.name;
    }

    return "reward_payout.execution_failed";
  }

  private getExecutionErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return "Reward payout execution failed during wallet transfer broadcast";
  }
}
