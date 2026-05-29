import { IsOptional, IsISO8601 } from "class-validator";

export class RequesterComparisonSetAnalyticsQueryDto {
  @IsOptional()
  @IsISO8601()
  now?: string;
}
