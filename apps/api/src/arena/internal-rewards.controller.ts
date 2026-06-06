import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalRetriggerRewardResolutionDto } from "./dto/internal-retrigger-reward-resolution.dto";
import { InternalRewardAuditQueryDto } from "./dto/internal-reward-audit-query.dto";
import { InternalRewardAuditService } from "./services/internal-reward-audit.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/rewards")
export class ArenaInternalRewardsController {
  constructor(private readonly rewards: InternalRewardAuditService) {}

  @Get()
  listRewards(@Query() query: InternalRewardAuditQueryDto) {
    return this.rewards.listRewards({
      propositionId: query.propositionId,
      userId: query.userId,
      responseId: query.responseId,
      status: query.status,
      sourceType: query.sourceType,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  @Get(":ledgerId")
  getReward(@Param("ledgerId") ledgerId: string) {
    return this.rewards.getRewardDetail(ledgerId);
  }

  @Post(":ledgerId/retrigger-review-resolution")
  retriggerReviewResolution(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalRetriggerRewardResolutionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.retriggerReviewResolution({
      ledgerId,
      actorUserId: request.user?.sub as string,
      resolvedAt: body.resolvedAt,
      reason: body.reason,
      note: body.note,
    });
  }
}
