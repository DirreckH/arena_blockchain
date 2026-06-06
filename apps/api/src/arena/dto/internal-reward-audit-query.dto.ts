import { IsEnum, IsNumberString, IsOptional, IsString } from "class-validator";
import type { RewardLedgerSourceType, RewardLedgerStatus } from "@prisma/client";
import type {
  InternalListSortDirection,
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
