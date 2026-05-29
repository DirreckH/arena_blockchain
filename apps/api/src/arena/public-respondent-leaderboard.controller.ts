import { Controller, Get } from "@nestjs/common";

import { Public } from "../common/decorators/public.decorator";
import { PublicRespondentLeaderboardService } from "./services/public-respondent-leaderboard.service";

@Public()
@Controller("arena/public/discovery")
export class ArenaPublicRespondentLeaderboardController {
  constructor(
    private readonly respondentLeaderboard: PublicRespondentLeaderboardService,
  ) {}

  @Get("respondent-leaderboard")
  getRespondentLeaderboard() {
    return this.respondentLeaderboard.getLeaderboard();
  }
}
