import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalEnsureRewardPayoutDto {
  @IsISO8601()
  ensuredAt!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
