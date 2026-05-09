import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { PlaceValidationBetResult } from "@arena/shared";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { PlaceMarketBetDto } from "./dto/place-market-bet.dto";
import { BetService } from "./services/bet.service";
import { ValidationViewService } from "./services/validation-view.service";

@Controller("arena/validation")
export class ArenaValidationController {
  constructor(
    private readonly validationViews: ValidationViewService,
    private readonly bets: BetService,
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

  @Post("markets/:marketId/bets")
  async placeBet(
    @Param("marketId") marketId: string,
    @Body() body: PlaceMarketBetDto,
    @Req() request: RequestWithUser,
  ): Promise<PlaceValidationBetResult> {
    const userId = this.getUserId(request);
    const chainId = Number(request.user?.chainId ?? 0);
    const bet = await this.bets.placeBet({
      propositionId: body.propositionId,
      marketId,
      userId,
      chainId,
      selectedOption: body.selectedOption as 0 | 1,
      stakeAmount: body.stakeAmount,
      placedAt: body.placedAt,
    });

    return {
      marketView: await this.validationViews.getMarket(marketId, userId),
      positionId: bet.id,
      execution: {
        mode: "wallet_authenticated_account_write",
        stage: "position_recorded",
        requiresWalletSignature: true,
        usesDemoFlow: false,
        chainId,
        txHash: null,
        submittedAt: bet.placedAt.toISOString(),
        recordedAt: bet.placedAt.toISOString(),
        statusLabel: "Position recorded",
        detail:
          "Arena validated the wallet-authenticated session and recorded the position in the live account write path.",
      },
    };
  }

  private getUserId(request: RequestWithUser): string {
    return request.user?.sub as string;
  }
}
