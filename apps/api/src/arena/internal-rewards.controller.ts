import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalApproveRewardPayoutDto } from "./dto/internal-approve-reward-payout.dto";
import { InternalCompleteRewardPayoutDto } from "./dto/internal-complete-reward-payout.dto";
import { InternalConfirmRewardPayoutExecutionDto } from "./dto/internal-confirm-reward-payout-execution.dto";
import { InternalEnsureRewardPayoutDto } from "./dto/internal-ensure-reward-payout.dto";
import { InternalFailRewardPayoutDto } from "./dto/internal-fail-reward-payout.dto";
import { InternalRetriggerRewardResolutionDto } from "./dto/internal-retrigger-reward-resolution.dto";
import { InternalRewardAuditQueryDto } from "./dto/internal-reward-audit-query.dto";
import { InternalStartRewardPayoutExecutionDto } from "./dto/internal-start-reward-payout-execution.dto";
import { InternalRewardAuditService } from "./services/internal-reward-audit.service";

@ArenaSurfaceBoundary("internal")
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
      payoutStatus: query.payoutStatus,
      missingPayoutOnly: query.missingPayoutOnly === "true",
      staleExecutionOnly: query.staleExecutionOnly === "true",
      actionQueue: query.actionQueue,
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

  @Post(":ledgerId/approve-payout")
  approvePayout(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalApproveRewardPayoutDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.approveRewardPayout({
      ledgerId,
      actorUserId: request.user?.sub as string,
      approvedAt: body.approvedAt,
      reason: body.reason,
      note: body.note,
    });
  }

  @Post(":ledgerId/ensure-payout")
  ensurePayout(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalEnsureRewardPayoutDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.ensureRewardPayout({
      ledgerId,
      actorUserId: request.user?.sub as string,
      ensuredAt: body.ensuredAt,
      reason: body.reason,
      note: body.note,
    });
  }

  @Post(":ledgerId/start-payout-execution")
  startPayoutExecution(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalStartRewardPayoutExecutionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.startRewardPayoutExecution({
      ledgerId,
      actorUserId: request.user?.sub as string,
      startedAt: body.startedAt,
      reason: body.reason,
      note: body.note,
    });
  }

  @Post(":ledgerId/complete-payout")
  completePayout(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalCompleteRewardPayoutDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.completeRewardPayout({
      ledgerId,
      actorUserId: request.user?.sub as string,
      completedAt: body.completedAt,
      reason: body.reason,
      note: body.note,
      executionTxHash: body.executionTxHash,
      externalReference: body.externalReference,
    });
  }

  @Post(":ledgerId/confirm-payout-execution")
  confirmPayoutExecution(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalConfirmRewardPayoutExecutionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.confirmRewardPayoutExecution({
      ledgerId,
      actorUserId: request.user?.sub as string,
      confirmedAt: body.confirmedAt,
      reason: body.reason,
      note: body.note,
      externalReference: body.externalReference,
    });
  }

  @Post(":ledgerId/fail-payout")
  failPayout(
    @Param("ledgerId") ledgerId: string,
    @Body() body: InternalFailRewardPayoutDto,
    @Req() request: RequestWithUser,
  ) {
    return this.rewards.failRewardPayout({
      ledgerId,
      actorUserId: request.user?.sub as string,
      failedAt: body.failedAt,
      reason: body.reason,
      note: body.note,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });
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
