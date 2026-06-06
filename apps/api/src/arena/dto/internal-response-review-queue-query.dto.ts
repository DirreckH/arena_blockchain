import { IsBooleanString, IsEnum, IsNumberString, IsOptional, IsString } from "class-validator";
import type { ResponseReviewStatus } from "@prisma/client";

import type {
  InternalListSortDirection,
  InternalResponseReviewQueueSortBy,
  ResponseReviewWorkflowStateViewModel,
} from "../internal-ops.types";

export class InternalResponseReviewQueueQueryDto {
  @IsOptional()
  @IsEnum(
    {
      unclaimed: "unclaimed",
      claimed: "claimed",
      released: "released",
      expired: "expired",
      finalized: "finalized",
    } satisfies Record<
      ResponseReviewWorkflowStateViewModel,
      ResponseReviewWorkflowStateViewModel
    >,
  )
  workflowState?: ResponseReviewWorkflowStateViewModel;

  @IsOptional()
  @IsString()
  propositionId?: string;

  @IsOptional()
  @IsBooleanString()
  claimStaleOnly?: string;

  @IsOptional()
  @IsString()
  claimedByUserId?: string;

  @IsOptional()
  @IsEnum(
    {
      pending_review: "pending_review",
      valid: "valid",
      partial_valid: "partial_valid",
      invalid: "invalid",
      fraud_suspected: "fraud_suspected",
    } satisfies Record<ResponseReviewStatus, ResponseReviewStatus>,
  )
  reviewStatus?: ResponseReviewStatus;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(
    {
      submittedAt: "submittedAt",
      claimedAt: "claimedAt",
      propositionTitle: "propositionTitle",
      userId: "userId",
      workflowState: "workflowState",
    } satisfies Record<
      InternalResponseReviewQueueSortBy,
      InternalResponseReviewQueueSortBy
    >,
  )
  sortBy?: InternalResponseReviewQueueSortBy;

  @IsOptional()
  @IsEnum(
    {
      asc: "asc",
      desc: "desc",
    } satisfies Record<InternalListSortDirection, InternalListSortDirection>,
  )
  sortDirection?: InternalListSortDirection;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}
