import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES = [
  "manual",
  "delivery_policy_manual",
  "delivery_policy_automation",
] as const;

export class RequesterComparisonSetExportListQueryDto {
  @IsOptional()
  @IsIn(REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES)
  origin?: (typeof REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES)[number];

  @IsOptional()
  @IsString()
  policyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
