import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

const REQUESTER_COMPARISON_SET_DELIVERY_RUN_STATUSES = [
  "completed",
  "failed",
] as const;

const REQUESTER_COMPARISON_SET_DELIVERY_RUN_TRIGGER_TYPES = [
  "manual",
  "automation",
] as const;

const REQUESTER_COMPARISON_SET_DELIVERY_RUN_REPLAY_FILTERS = [
  "all",
  "fresh_only",
  "replayed_only",
] as const;

export class RequesterComparisonSetDeliveryRunListQueryDto {
  @IsOptional()
  @IsIn(REQUESTER_COMPARISON_SET_DELIVERY_RUN_STATUSES)
  status?: (typeof REQUESTER_COMPARISON_SET_DELIVERY_RUN_STATUSES)[number];

  @IsOptional()
  @IsIn(REQUESTER_COMPARISON_SET_DELIVERY_RUN_TRIGGER_TYPES)
  triggerType?: (typeof REQUESTER_COMPARISON_SET_DELIVERY_RUN_TRIGGER_TYPES)[number];

  @IsOptional()
  @IsIn(REQUESTER_COMPARISON_SET_DELIVERY_RUN_REPLAY_FILTERS)
  replay?: (typeof REQUESTER_COMPARISON_SET_DELIVERY_RUN_REPLAY_FILTERS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
