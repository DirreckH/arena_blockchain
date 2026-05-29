import { IsHexadecimal, IsISO8601, IsInt, IsString, Length, Max, Min } from "class-validator";

export class ConfirmMarketBetDto {
  @IsString()
  propositionId!: string;

  @IsInt()
  @Min(0)
  @Max(1)
  selectedOption!: number;

  @IsString()
  stakeAmount!: string;

  @IsISO8601()
  placedAt!: string;

  @IsString()
  @IsHexadecimal()
  @Length(66, 66)
  txHash!: string;
}
