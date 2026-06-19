import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { SystemRole } from "@arena/shared";
import type { Response } from "express";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalValidationChainBatchReconcileDto } from "./dto/internal-validation-chain-batch-reconcile.dto";
import { InternalValidationChainCancelMarketDto } from "./dto/internal-validation-chain-cancel-market.dto";
import { InternalValidationChainCommandDto } from "./dto/internal-validation-chain-command.dto";
import { InternalValidationChainPauseDto } from "./dto/internal-validation-chain-pause.dto";
import { InternalValidationProofRecordDto } from "./dto/internal-validation-proof-record.dto";
import { InternalValidationRehearsalCheckpointDto } from "./dto/internal-validation-rehearsal-checkpoint.dto";
import type { PropositionValidationRehearsalStepId } from "./internal-ops.types";
import type { ValidationChainBetReconciliationBatchViewModel } from "./internal-ops.types";
import type { ValidationChainBetReconciliationViewModel } from "./internal-ops.types";
import type { ValidationChainProjectionReplayViewModel } from "./internal-ops.types";
import type { ValidationChainCommandResult } from "./validation-chain/validation-chain.types";
import { ValidationChainOperatorCommandService } from "./validation-chain/validation-chain-operator-command.service";
import { ValidationChainBetReconciliationService } from "./validation-chain/validation-chain-bet-reconciliation.service";
import { ValidationChainCommandRecoveryService } from "./validation-chain/validation-chain-command-recovery.service";
import { ValidationChainManualSyncService } from "./validation-chain/validation-chain-manual-sync.service";
import { ValidationChainOracleService } from "./validation-chain/validation-chain-oracle.service";
import { ValidationChainPauserService } from "./validation-chain/validation-chain-pauser.service";
import { ValidationChainProjectionReplayService } from "./validation-chain/validation-chain-projection-replay.service";
import { ValidationProofRecordService } from "./services/validation-proof-record.service";
import { ValidationRehearsalCheckpointService } from "./services/validation-rehearsal-checkpoint.service";

@ArenaSurfaceBoundary("internal")
@Controller("arena/internal/validation-chain")
export class ArenaInternalValidationChainController {
  constructor(
    private readonly commands: ValidationChainOperatorCommandService,
    private readonly oracle: ValidationChainOracleService,
    private readonly pauser: ValidationChainPauserService,
    private readonly sync: ValidationChainManualSyncService,
    private readonly betReconciliation: ValidationChainBetReconciliationService,
    private readonly projectionReplay: ValidationChainProjectionReplayService,
    private readonly commandRecovery: ValidationChainCommandRecoveryService,
    private readonly proofRecords: ValidationProofRecordService,
    private readonly rehearsalCheckpoints: ValidationRehearsalCheckpointService,
  ) {}

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/create-market")
  createMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.createMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticRehearsalCheckpoint({
        result,
        actorUserId: request.user?.sub,
        stepId: "publish_and_open",
        reason: "validation_rehearsal.auto.create_market_submitted",
        note: body.note,
        commandName: "create_market",
      }),
    );
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/open-market")
  openMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.openMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticRehearsalCheckpoint({
        result,
        actorUserId: request.user?.sub,
        stepId: "publish_and_open",
        reason: "validation_rehearsal.auto.open_market_submitted",
        note: body.note,
        commandName: "open_market",
      }),
    );
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/freeze-market")
  freezeMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.freezeMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticRehearsalCheckpoint({
        result,
        actorUserId: request.user?.sub,
        stepId: "freeze_and_resolve",
        reason: "validation_rehearsal.auto.freeze_market_submitted",
        note: body.note,
        commandName: "freeze_market",
      }),
    );
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/resolve-market")
  resolveMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.oracle.resolveMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticRehearsalCheckpoint({
        result,
        actorUserId: request.user?.sub,
        stepId: "freeze_and_resolve",
        reason: "validation_rehearsal.auto.resolve_market_submitted",
        note: body.note,
        commandName: "resolve_market",
      }),
    );
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/cancel-market")
  cancelMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCancelMarketDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.cancelMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
      reasonCode: body.reasonCode,
    });
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("pause")
  pauseValidationChain(
    @Body() body: InternalValidationChainPauseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.pauser.pauseValidationChain({
      actorUserId: request.user?.sub as string,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("unpause")
  unpauseValidationChain(
    @Body() body: InternalValidationChainPauseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.pauser.unpauseValidationChain({
      actorUserId: request.user?.sub as string,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("sync")
  syncValidationChain(
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.sync.syncNow({
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/recover-command")
  async recoverValidationChainCommands(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.commandRecovery.recoverQueuedCommands({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });

    response.status(this.resolveRecoveryStatusCode(result.requestStatus));

    return result;
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("backlog/reconcile")
  reconcileUnsyncedValidationBets(
    @Body() body: InternalValidationChainBatchReconcileDto,
    @Req() request: RequestWithUser,
  ) {
    return this.betReconciliation.reconcileUnsyncedBets({
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
      limit: body.limit,
    }).then((result) =>
      this.recordAutomaticBatchBetReconciliationCheckpoints({
        result,
        actorUserId: request.user?.sub,
        note: body.note,
      }),
    );
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("markets/:marketId/replay-projection")
  replayValidationMarketProjection(
    @Param("marketId") marketId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.projectionReplay.replayMarketProjection({
      marketId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticProjectionReplayCheckpoint({
        result,
        actorUserId: request.user?.sub,
        note: body.note,
      }),
    );
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("markets/:marketId/bets/:userId/reconcile")
  reconcileValidationBet(
    @Param("marketId") marketId: string,
    @Param("userId") userId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.betReconciliation.reconcileBet({
      marketId,
      userId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    }).then((result) =>
      this.recordAutomaticBetReconciliationCheckpoint({
        result,
        actorUserId: request.user?.sub,
        note: body.note,
      }),
    );
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/rehearsal-checkpoints")
  recordRehearsalCheckpoint(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationRehearsalCheckpointDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rehearsalCheckpoints.recordCheckpoint({
      propositionId,
      stepId: body.stepId as any,
      status: (body.status as any) ?? "complete",
      reason: body.reason,
      note: body.note,
      evidence: body.evidence,
      txHash: body.txHash,
      blockNumber: body.blockNumber,
      actorUserId: request.user?.sub,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("proof-record")
  recordValidationProof(
    @Body() body: InternalValidationProofRecordDto,
    @Req() request: RequestWithUser,
  ) {
    return this.proofRecords.recordProof({
      propositionId: body.propositionId,
      proofComplete: body.proofComplete,
      failures: body.failures,
      releaseReadinessStatus: body.releaseReadinessStatus as
        | "ready"
        | "blocked"
        | "unknown",
      releaseBlockingDependencies: body.releaseBlockingDependencies,
      validationRehearsalStatus:
        (body.validationRehearsalStatus as "ready" | "blocked" | "unknown") ??
        "unknown",
      validationCurrentStepId:
        (body.validationCurrentStepId as PropositionValidationRehearsalStepId | null) ??
        null,
      validationCurrentStepStatus:
        (body.validationCurrentStepStatus as "complete" | "blocked" | "pending" | null) ??
        null,
      completedStepCount: body.completedStepCount,
      remainingStepCount: body.remainingStepCount,
      latestCheckpointStepId:
        (body.latestCheckpointStepId as PropositionValidationRehearsalStepId | null) ??
        null,
      latestCheckpointStatus:
        (body.latestCheckpointStatus as "complete" | "blocked" | "pending" | null) ??
        null,
      latestCheckpointAt: body.latestCheckpointAt ?? null,
      publicSettledResultVisible: body.publicSettledResultVisible ?? false,
      publicIntegrityOverviewVisible: body.publicIntegrityOverviewVisible ?? false,
      rewardPayoutLedgerEntryCount: body.rewardPayoutLedgerEntryCount ?? 0,
      rewardPayoutRecordCount: body.rewardPayoutRecordCount ?? 0,
      rewardPayoutFinalizedWithoutPayoutCount:
        body.rewardPayoutFinalizedWithoutPayoutCount ?? 0,
      rewardPayoutExecutingWithoutTxHashCount:
        body.rewardPayoutExecutingWithoutTxHashCount ?? 0,
      rewardPayoutStaleExecutingCount:
        body.rewardPayoutStaleExecutingCount ?? 0,
      rewardPayoutStaleExecutingWithoutTxHashCount:
        body.rewardPayoutStaleExecutingWithoutTxHashCount ?? 0,
      rewardPayoutStaleExecutingAwaitingConfirmationCount:
        body.rewardPayoutStaleExecutingAwaitingConfirmationCount ?? 0,
      rewardPayoutCompletedWithExecutionTxHashCount:
        body.rewardPayoutCompletedWithExecutionTxHashCount ?? 0,
      rewardPayoutStatusCounts: body.rewardPayoutStatusCounts ?? null,
      summaryArtifactPath: body.summaryArtifactPath ?? null,
      evidenceArtifactPath: body.evidenceArtifactPath ?? null,
      publicResultArtifactPath: body.publicResultArtifactPath ?? null,
      rewardPayoutArtifactPath: body.rewardPayoutArtifactPath ?? null,
      publicIntegrityArtifactPath: body.publicIntegrityArtifactPath ?? null,
      note: body.note ?? null,
      actorUserId: request.user?.sub,
      checkedAt: body.checkedAt,
    });
  }

  private async recordAutomaticRehearsalCheckpoint(input: {
    result: ValidationChainCommandResult;
    actorUserId?: string | null;
    stepId: PropositionValidationRehearsalStepId;
    reason: string;
    note?: string;
    commandName: "create_market" | "open_market" | "freeze_market" | "resolve_market";
  }): Promise<ValidationChainCommandResult> {
    await this.rehearsalCheckpoints.recordCheckpoint({
      propositionId: input.result.propositionId,
      stepId: input.stepId,
      status: "complete",
      reason: input.reason,
      note: input.note,
      evidence: [
        `command=${input.commandName}`,
        `marketId=${input.result.marketId}`,
        `chainMarketId=${input.result.chainMarketId}`,
        `chainPropositionId=${input.result.chainPropositionId}`,
        `attemptedAt=${input.result.attemptedAt}`,
      ],
      txHash: input.result.txHash,
      actorUserId: input.actorUserId,
      recordedAt: input.result.attemptedAt,
    });

    return input.result;
  }

  private async recordAutomaticBetReconciliationCheckpoint(input: {
    result: ValidationChainBetReconciliationViewModel;
    actorUserId?: string | null;
    note?: string;
  }): Promise<ValidationChainBetReconciliationViewModel> {
    const matched =
      input.result.comparison.positionExists &&
      input.result.comparison.optionMatches &&
      input.result.comparison.amountMatches &&
      input.result.comparison.claimedMatches;

    await this.rehearsalCheckpoints.recordCheckpoint({
      propositionId: input.result.propositionId,
      stepId: "local_bet_and_sync",
      status: matched ? "complete" : "blocked",
      reason: matched
        ? "validation_rehearsal.auto.bet_reconciliation_matched"
        : "validation_rehearsal.auto.bet_reconciliation_mismatched",
      note: input.note,
      evidence: [
        `betId=${input.result.betId}`,
        `marketId=${input.result.marketId}`,
        `userId=${input.result.userId}`,
        `positionExists=${String(input.result.comparison.positionExists)}`,
        `optionMatches=${String(input.result.comparison.optionMatches)}`,
        `amountMatches=${String(input.result.comparison.amountMatches)}`,
        `claimedMatches=${String(input.result.comparison.claimedMatches)}`,
        `claimableAmount=${input.result.comparison.claimableAmount}`,
      ],
      actorUserId: input.actorUserId,
    });

    return input.result;
  }

  private async recordAutomaticBatchBetReconciliationCheckpoints(input: {
    result: ValidationChainBetReconciliationBatchViewModel;
    actorUserId?: string | null;
    note?: string;
  }): Promise<ValidationChainBetReconciliationBatchViewModel> {
    const itemsByPropositionId = new Map<
      string,
      ValidationChainBetReconciliationBatchViewModel["items"]
    >();

    for (const item of input.result.items) {
      const existing = itemsByPropositionId.get(item.propositionId) ?? [];
      existing.push(item);
      itemsByPropositionId.set(item.propositionId, existing);
    }

    await Promise.all(
      Array.from(itemsByPropositionId.entries()).map(
        async ([propositionId, propositionItems]) => {
          const matchedCount = propositionItems.filter(
            (item) => item.status === "matched",
          ).length;
          const mismatchedCount = propositionItems.filter(
            (item) => item.status === "mismatched",
          ).length;
          const failedCount = propositionItems.filter(
            (item) => item.status === "failed",
          ).length;
          const status =
            mismatchedCount === 0 && failedCount === 0 ? "complete" : "blocked";

          await this.rehearsalCheckpoints.recordCheckpoint({
            propositionId,
            stepId: "local_bet_and_sync",
            status,
            reason:
              status === "complete"
                ? "validation_rehearsal.auto.batch_bet_reconciliation_matched"
                : "validation_rehearsal.auto.batch_bet_reconciliation_incomplete",
            note: input.note,
            evidence: [
              `processedCount=${String(propositionItems.length)}`,
              `matchedCount=${String(matchedCount)}`,
              `mismatchedCount=${String(mismatchedCount)}`,
              `failedCount=${String(failedCount)}`,
              `betIds=${propositionItems.map((item) => item.betId).join(",")}`,
            ],
            actorUserId: input.actorUserId,
            recordedAt: input.result.processedAt,
          });
        },
      ),
    );

    return input.result;
  }

  private async recordAutomaticProjectionReplayCheckpoint(input: {
    result: ValidationChainProjectionReplayViewModel;
    actorUserId?: string | null;
    note?: string;
  }): Promise<ValidationChainProjectionReplayViewModel> {
    const terminalMarketProjection =
      input.result.finalMarketProjection.chainStatus === "resolved" ||
      input.result.finalMarketProjection.chainStatus === "cancelled";
    const hasTerminalBetProjection = input.result.finalBetProjections.some(
      (bet) => bet.status === "settled" && bet.settlementOutcome !== null,
    );
    const hasProjectedBetSync = input.result.finalBetProjections.some(
      (bet) => bet.chainSyncedAt !== null,
    );
    const propositionSettled =
      input.result.propositionStatus === "settled" &&
      input.result.propositionSettledAt !== null;
    const converged =
      terminalMarketProjection &&
      hasTerminalBetProjection &&
      hasProjectedBetSync &&
      propositionSettled;

    await this.rehearsalCheckpoints.recordCheckpoint({
      propositionId: input.result.propositionId,
      stepId: "projection_and_settlement",
      status: converged ? "complete" : "blocked",
      reason: converged
        ? "validation_rehearsal.auto.projection_settlement_converged"
        : "validation_rehearsal.auto.projection_settlement_incomplete",
      note: input.note,
      evidence: [
        `marketId=${input.result.marketId}`,
        `chainMarketId=${input.result.chainMarketId}`,
        `chainPropositionId=${input.result.chainPropositionId}`,
        `replayedEventCount=${String(input.result.replayedEventCount)}`,
        `propositionStatus=${input.result.propositionStatus}`,
        `propositionSettledAt=${input.result.propositionSettledAt ?? "missing"}`,
        `chainStatus=${input.result.finalMarketProjection.chainStatus ?? "missing"}`,
        `chainResolvedAt=${input.result.finalMarketProjection.chainResolvedAt ?? "missing"}`,
        `chainCancelledAt=${input.result.finalMarketProjection.chainCancelledAt ?? "missing"}`,
        `terminalBetCount=${String(
          input.result.finalBetProjections.filter(
            (bet) => bet.status === "settled" && bet.settlementOutcome !== null,
          ).length,
        )}`,
        `projectedSyncedBetCount=${String(
          input.result.finalBetProjections.filter(
            (bet) => bet.chainSyncedAt !== null,
          ).length,
        )}`,
      ],
      txHash:
        input.result.finalMarketProjection.resolutionTxHash ??
        input.result.finalMarketProjection.cancelTxHash,
      actorUserId: input.actorUserId,
      recordedAt: input.result.processedAt,
    });

    return input.result;
  }

  private resolveRecoveryStatusCode(
    requestStatus:
      | "queued"
      | "already_pending"
      | "partial_failure"
      | "failed",
  ): number {
    switch (requestStatus) {
      case "queued":
        return HttpStatus.CREATED;
      case "already_pending":
        return HttpStatus.OK;
      case "partial_failure":
      case "failed":
        return HttpStatus.SERVICE_UNAVAILABLE;
    }
  }
}
