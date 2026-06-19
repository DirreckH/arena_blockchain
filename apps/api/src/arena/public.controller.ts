import { Controller, Get, Param, Query } from "@nestjs/common";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Public } from "../common/decorators/public.decorator";
import { PublicMarketSearchQueryDto } from "./dto/public-market-search-query.dto";
import { EffectiveSampleCounterService } from "./services/effective-sample-counter.service";
import { PublicIntegrityViewService } from "./services/public-integrity-view.service";
import { PublicResultViewService } from "./services/public-result-view.service";
import { ValidationViewService } from "./services/validation-view.service";

@ArenaSurfaceBoundary("public")
@Public()
@Controller("arena/public")
export class ArenaPublicController {
  constructor(
    private readonly counters: EffectiveSampleCounterService,
    private readonly validationViews: ValidationViewService,
    private readonly publicResults: PublicResultViewService,
    private readonly publicIntegrity: PublicIntegrityViewService,
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

  @Get("markets/search")
  searchMarkets(@Query() query: PublicMarketSearchQueryDto) {
    return this.validationViews.searchMarkets(query.q);
  }

  @Get("markets/:marketId")
  getMarket(
    @Param("marketId") marketId: string,
  ) {
    return this.validationViews.getMarket(marketId);
  }

  @Get("results/settled")
  listSettledResults() {
    return this.publicResults.listSettledResults();
  }

  @Get("integrity/overview")
  getIntegrityOverview(@Query("propositionId") propositionId?: string) {
    return this.publicIntegrity.getOverview(propositionId);
  }
}
