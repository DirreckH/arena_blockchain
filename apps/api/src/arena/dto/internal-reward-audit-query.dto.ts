import { IsEnum, IsOptional, IsString } from "class-validator";
import type { RewardLedgerSourceType, RewardLedgerStatus } from "@prisma/client";

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
}
