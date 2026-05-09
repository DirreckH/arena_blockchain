import { Controller, Get, Param, Req } from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { ResultViewService } from "./services/result-view.service";

@Controller("arena/adjudication/results")
export class ArenaRespondentResultsController {
  constructor(private readonly resultViews: ResultViewService) {}

  @Get("overview")
  getOwnResultOverview(@Req() request: RequestWithUser) {
    return this.resultViews.getResultOverviewForUser(
      request.user?.sub as string,
    );
  }

  @Get()
  listOwnResults(@Req() request: RequestWithUser) {
    return this.resultViews.listResultsForUser(request.user?.sub as string);
  }

  @Get(":propositionId")
  getOwnResultSummary(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.resultViews.getResultSummary(
      propositionId,
      request.user?.sub as string,
    );
  }
}
