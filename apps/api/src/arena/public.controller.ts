import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "../common/decorators/public.decorator";
import { EffectiveSampleCounterService } from "./services/effective-sample-counter.service";
import { ValidationViewService } from "./services/validation-view.service";

@Public()
@Controller("arena/public")
export class ArenaPublicController {
  constructor(
    private readonly counters: EffectiveSampleCounterService,
    private readonly validationViews: ValidationViewService,
  ) {}

  @Get("propositions/:propositionId/progress")
  getPropositionProgress(
    @Param("propositionId") propositionId: string,
  ) {
    return this.counters.getPublicProgress(propositionId);
  }

  @Get("markets")
  listMarkets() {
    return this.validationViews.listMarkets();
  }

  @Get("markets/:marketId")
  getMarket(
    @Param("marketId") marketId: string,
  ) {
    return this.validationViews.getMarket(marketId);
  }
}
