import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalReleasePendingResponseReviewDto {
  @IsISO8601()
  releasedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
