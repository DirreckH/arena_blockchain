import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalReviewPendingResponseDto } from "./dto/internal-review-pending-response.dto";
import { QualityEngineService } from "./services/quality-engine.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/responses")
export class ArenaInternalResponsesController {
  constructor(private readonly quality: QualityEngineService) {}

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
