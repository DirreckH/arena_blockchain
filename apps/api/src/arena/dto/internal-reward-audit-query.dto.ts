import { IsBooleanString, IsEnum, IsNumberString, IsOptional, IsString } from "class-validator";
import type {
  RewardLedgerSourceType,
  RewardLedgerStatus,
  RewardPayoutStatus,
} from "@prisma/client";
import type {
  InternalListSortDirection,
  RewardAuditActionQueue,
  RewardAuditListSortBy,
} from "../internal-ops.types";

export class InternalRewardAuditQueryDto {
  @IsOptional()
  @IsString()
  propositionId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  responseId?: string;

  @IsOptional()
  @IsEnum(
    {
      pending: "pending",
      finalized: "finalized",
      voided: "voided",
      reversed: "reversed",
    } satisfies Record<RewardLedgerStatus, RewardLedgerStatus>,
  )
  status?: RewardLedgerStatus;

  @IsOptional()
  @IsEnum(
    {
      requested: "requested",
      approved: "approved",
      executing: "executing",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
    } satisfies Record<RewardPayoutStatus, RewardPayoutStatus>,
  )
  payoutStatus?: RewardPayoutStatus;

  @IsOptional()
  @IsBooleanString()
  missingPayoutOnly?: string;

  @IsOptional()
  @IsBooleanString()
  staleExecutionOnly?: string;

  @IsOptional()
  @IsEnum(
    {
      missing_payout: "missing_payout",
      approval: "approval",
      execution_start: "execution_start",
      execution_confirm: "execution_confirm",
      execution_recover: "execution_recover",
      retry: "retry",
    } satisfies Record<RewardAuditActionQueue, RewardAuditActionQueue>,
  )
  actionQueue?: RewardAuditActionQueue;

  @IsOptional()
  @IsEnum(
    {
      response: "response",
    } satisfies Record<RewardLedgerSourceType, RewardLedgerSourceType>,
  )
  sourceType?: RewardLedgerSourceType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(
    {
      createdAt: "createdAt",
      finalizedAt: "finalizedAt",
      propositionTitle: "propositionTitle",
      userId: "userId",
      amount: "amount",
      ledgerVersion: "ledgerVersion",
    } satisfies Record<RewardAuditListSortBy, RewardAuditListSortBy>,
  )
  sortBy?: RewardAuditListSortBy;

  @IsOptional()
  @IsEnum(
    {
      asc: "asc",
      desc: "desc",
    } satisfies Record<InternalListSortDirection, InternalListSortDirection>,
  )
  sortDirection?: InternalListSortDirection;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}
