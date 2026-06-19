import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalConfirmRewardPayoutExecutionDto {
  @IsISO8601()
  confirmedAt!: string;

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
  externalReference?: string;
}
