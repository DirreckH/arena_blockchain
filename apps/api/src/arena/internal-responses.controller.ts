import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalClaimPendingResponseReviewDto } from "./dto/internal-claim-pending-response-review.dto";
import { InternalReleasePendingResponseReviewDto } from "./dto/internal-release-pending-response-review.dto";
import { InternalReviewPendingResponseDto } from "./dto/internal-review-pending-response.dto";
import { QualityEngineService } from "./services/quality-engine.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/responses")
export class ArenaInternalResponsesController {
  constructor(private readonly quality: QualityEngineService) {}

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
