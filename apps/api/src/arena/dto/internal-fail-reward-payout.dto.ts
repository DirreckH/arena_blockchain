import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalFailRewardPayoutDto {
  @IsISO8601()
  failedAt!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsString()
  @MaxLength(100)
  errorCode!: string;

  @IsString()
  @MaxLength(1000)
  errorMessage!: string;
}
