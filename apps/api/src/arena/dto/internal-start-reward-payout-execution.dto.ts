import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalStartRewardPayoutExecutionDto {
  @IsISO8601()
  startedAt!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
