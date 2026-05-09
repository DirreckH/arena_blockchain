import { Controller, Get, Req } from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { ReputationService } from "./services/reputation.service";

@Controller("arena/adjudication/reputation")
export class ArenaRespondentReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Get()
  getOwnReputation(@Req() request: RequestWithUser) {
    return this.reputation.getSummaryForUser(request.user?.sub as string);
  }
}
