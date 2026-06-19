import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalCompleteRewardPayoutDto {
  @IsISO8601()
  completedAt!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  executionTxHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;
}
