import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalClaimPendingResponseReviewDto } from "./dto/internal-claim-pending-response-review.dto";
import { InternalResponseReviewQueueQueryDto } from "./dto/internal-response-review-queue-query.dto";
import { InternalReleasePendingResponseReviewDto } from "./dto/internal-release-pending-response-review.dto";
import { InternalReviewPendingResponseDto } from "./dto/internal-review-pending-response.dto";
import { QualityEngineService } from "./services/quality-engine.service";
import { InternalResponseReviewOpsService } from "./services/internal-response-review-ops.service";

@ArenaSurfaceBoundary("internal")
@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/responses")
export class ArenaInternalResponsesController {
  constructor(
    private readonly quality: QualityEngineService,
    private readonly responseOps: InternalResponseReviewOpsService,
  ) {}

  @Get()
  listPendingResponseReviews(
    @Query() query: InternalResponseReviewQueueQueryDto,
  ) {
    return this.responseOps.listResponses({
      workflowState: query.workflowState,
      propositionId: query.propositionId,
      claimStaleOnly:
        query.claimStaleOnly === undefined
          ? undefined
          : query.claimStaleOnly === "true",
      claimedByUserId: query.claimedByUserId,
      reviewStatus: query.reviewStatus,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  @Get(":responseId")
  getPendingResponseReviewDetail(
    @Param("responseId") responseId: string,
  ) {
    return this.responseOps.getResponseDetail(responseId);
  }

  @Get(":responseId/review-state")
  getPendingResponseReviewState(
    @Param("responseId") responseId: string,
  ) {
    return this.quality.getPendingResponseReviewState(responseId);
  }

  @Post(":responseId/claim")
  claimPendingResponseReview(
    @Param("responseId") responseId: string,
    @Body() body: InternalClaimPendingResponseReviewDto,
    @Req() request: RequestWithUser,
  ) {
    return this.quality.claimPendingResponseReview({
      responseId,
      claimedAt: body.claimedAt,
      claimedByUserId: request.user?.sub as string,
      note: body.note,
    });
  }

  @Post(":responseId/release")
  releasePendingResponseReview(
    @Param("responseId") responseId: string,
    @Body() body: InternalReleasePendingResponseReviewDto,
    @Req() request: RequestWithUser,
  ) {
    return this.quality.releasePendingResponseReview({
      responseId,
      releasedAt: body.releasedAt,
      releasedByUserId: request.user?.sub as string,
      note: body.note,
    });
  }

  @Post(":responseId/review")
  reviewPendingResponse(
    @Param("responseId") responseId: string,
    @Body() body: InternalReviewPendingResponseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.quality.reviewPendingResponse({
      responseId,
      reviewedAt: body.reviewedAt,
      reviewedByUserId: request.user?.sub as string,
    });
  }
}
