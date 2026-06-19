import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type {
  PlaceValidationBetResult,
  PrepareValidationBetResult,
} from "@arena/shared";

import { ArenaRateLimit } from "../common/decorators/arena-rate-limit.decorator";
import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { ConfirmMarketBetDto } from "./dto/confirm-market-bet.dto";
import { PrepareMarketBetDto } from "./dto/prepare-market-bet.dto";
import { ValidationBetExecutionService } from "./services/validation-bet-execution.service";
import { ValidationViewService } from "./services/validation-view.service";

@ArenaSurfaceBoundary("validation")
@Controller("arena/validation")
export class ArenaValidationController {
  constructor(
    private readonly validationViews: ValidationViewService,
    private readonly betExecution: ValidationBetExecutionService,
  ) {}

  @Get("markets")
  listMarkets(
    @Req() request: RequestWithUser,
  ) {
    return this.validationViews.listMarkets(this.getUserId(request));
  }

  @Get("markets/:marketId")
  getMarket(
    @Param("marketId") marketId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.validationViews.getMarket(marketId, this.getUserId(request));
  }

  @Post("markets/:marketId/bets/prepare")
  @ArenaRateLimit("validation_bet_prepare")
  async prepareBet(
    @Param("marketId") marketId: string,
    @Body() body: PrepareMarketBetDto,
    @Req() request: RequestWithUser,
  ): Promise<PrepareValidationBetResult> {
    const userId = this.getUserId(request);
    const chainId = Number(request.user?.chainId ?? 0);
    return this.betExecution.prepare({
      propositionId: body.propositionId,
      marketId,
      userId,
      chainId,
      selectedOption: body.selectedOption as 0 | 1,
      stakeAmount: body.stakeAmount,
      placedAt: body.placedAt,
    });
  }

  @Post("markets/:marketId/bets/confirm")
  @ArenaRateLimit("validation_bet_confirm")
  async confirmBet(
    @Param("marketId") marketId: string,
    @Body() body: ConfirmMarketBetDto,
    @Req() request: RequestWithUser,
  ): Promise<PlaceValidationBetResult> {
    const userId = this.getUserId(request);
    const chainId = Number(request.user?.chainId ?? 0);

    return this.betExecution.confirm({
      propositionId: body.propositionId,
      marketId,
      userId,
      chainId,
      selectedOption: body.selectedOption as 0 | 1,
      stakeAmount: body.stakeAmount,
      placedAt: body.placedAt,
      txHash: body.txHash,
    });
  }

  private getUserId(request: RequestWithUser): string {
    return request.user?.sub as string;
  }
}
