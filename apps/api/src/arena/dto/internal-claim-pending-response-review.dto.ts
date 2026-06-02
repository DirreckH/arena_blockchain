import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalClaimPendingResponseReviewDto {
  @IsISO8601()
  claimedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
