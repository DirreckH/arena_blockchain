import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class RequesterPropositionAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @IsOptional()
  @IsISO8601()
  now?: string;

  @IsOptional()
  @IsString()
  presetId?: string;
}
