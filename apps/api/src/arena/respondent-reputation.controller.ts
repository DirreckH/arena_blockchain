import { Controller, Get, Req } from "@nestjs/common";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { ReputationService } from "./services/reputation.service";

@ArenaSurfaceBoundary("adjudication")
@Controller("arena/adjudication/reputation")
export class ArenaRespondentReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Get()
  getOwnReputation(@Req() request: RequestWithUser) {
    return this.reputation.getSummaryForUser(request.user?.sub as string);
  }
}
