import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalApprovePropositionDto } from "./dto/internal-approve-proposition.dto";
import { InternalEmergencyFreezePropositionDto } from "./dto/internal-emergency-freeze-proposition.dto";
import { InternalPropositionListQueryDto } from "./dto/internal-proposition-list-query.dto";
import { InternalRejectPropositionDto } from "./dto/internal-reject-proposition.dto";
import { InternalReviewQueueQueryDto } from "./dto/internal-review-queue-query.dto";
import { InternalPropositionOpsService } from "./services/internal-proposition-ops.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/propositions")
export class ArenaInternalPropositionsController {
  constructor(private readonly propositions: InternalPropositionOpsService) {}

  @Get()
  listPropositions(@Query() query: InternalPropositionListQueryDto) {
    return this.propositions.listPropositions({
      status: query.status,
      submissionStatus: query.submissionStatus,
      category: query.category,
      marketEnabled:
        query.marketEnabled === undefined
          ? undefined
          : query.marketEnabled === "true",
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });
  }

  @Get("review-queue")
  listReviewQueue(@Query() query: InternalReviewQueueQueryDto) {
    return this.propositions.listReviewQueue({
      category: query.category,
      marketEnabled:
        query.marketEnabled === undefined
          ? undefined
          : query.marketEnabled === "true",
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });
  }

  @Get(":propositionId")
  getProposition(@Param("propositionId") propositionId: string) {
    return this.propositions.getPropositionDetail(propositionId);
  }

  @Get(":propositionId/export")
  exportProposition(@Param("propositionId") propositionId: string) {
    return this.propositions.exportPropositionAudit(propositionId);
  }

  @Post(":propositionId/approve")
  approveProposition(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalApprovePropositionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.propositions.approveProposition({
      propositionId,
      actorUserId: request.user?.sub as string,
      publishedAt: body.publishedAt,
      reason: body.reason,
      note: body.note,
    });
  }

  @Post(":propositionId/reject")
  rejectProposition(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalRejectPropositionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.propositions.rejectProposition({
      propositionId,
      actorUserId: request.user?.sub as string,
      rejectedAt: body.rejectedAt ?? new Date().toISOString(),
      reason: body.reason,
      note: body.note,
    });
  }

  @Post(":propositionId/emergency-freeze")
  emergencyFreeze(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalEmergencyFreezePropositionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.propositions.emergencyFreeze({
      propositionId,
      actorUserId: request.user?.sub as string,
      frozenAt: body.frozenAt,
      reason: body.reason,
      note: body.note,
    });
  }
}
