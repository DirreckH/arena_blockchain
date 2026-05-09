import { Controller, Get, Param } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import { ReputationService } from "./services/reputation.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/respondents")
export class ArenaInternalReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Get(":userId/reputation")
  getRespondentReputation(@Param("userId") userId: string) {
    return this.reputation.getInternalViewForUser(userId);
  }
}
