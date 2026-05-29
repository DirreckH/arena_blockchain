import { IsISO8601, IsInt, IsString, Max, Min } from "class-validator";

export class PrepareMarketBetDto {
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
}
