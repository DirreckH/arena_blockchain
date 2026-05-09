import { Controller, Get, Req } from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { RewardViewService } from "./services/reward-view.service";

@Controller("arena/adjudication/rewards")
export class ArenaRespondentRewardsController {
  constructor(private readonly rewardViews: RewardViewService) {}

  @Get()
  listRewards(@Req() request: RequestWithUser) {
    return this.rewardViews.listRewardsForUser(request.user?.sub as string);
  }
}
