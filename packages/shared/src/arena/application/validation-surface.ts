import type {
  PrepareValidationBetResult,
  PlaceValidationBetResult,
  ValidationMarketViewModel,
  PlacePositionBetInput,
} from "../dto.js";
import type { ValidationSurfaceContract } from "../service-contracts.js";
import { PropositionNotFoundError } from "../adjudication/errors.js";
import { buildValidationMarketViewModel } from "../validation/snapshot-builder.js";
import { MarketNotFoundError } from "../validation/errors.js";
import type { ValidationSurfaceDependencies } from "./ports.js";
import { MarketViewNotAccessibleError } from "./errors.js";

export class ValidationSurface implements ValidationSurfaceContract {
  constructor(private readonly deps: ValidationSurfaceDependencies) {}

  async listMarkets(userId?: string): Promise<ValidationMarketViewModel[]> {
    const now = this.deps.clock.now();
    const markets = await this.deps.markets.list();

    return Promise.all(
      markets.map((market) => this.buildMarketView(market.id, now, userId)),
    );
  }

  async getMarket(
    marketId: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel | null> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) {
      return null;
    }

    return this.buildMarketView(marketId, this.deps.clock.now(), userId);
  }

  async prepareBetForUser(
    input: PlacePositionBetInput,
  ): Promise<PrepareValidationBetResult> {
    const marketView = await this.getMarket(input.marketId, input.userId);

    if (!marketView) {
      throw new MarketViewNotAccessibleError(input.marketId);
    }

    return {
      marketView,
      execution: {
        mode: "wallet_direct_contract_write",
        stage: "session_validated",
        requiresWalletSignature: true,
        usesDemoFlow: false,
        chainId: input.chainId,
        txHash: null,
        submittedAt: input.placedAt,
        recordedAt: input.placedAt,
        statusLabel: "Wallet session validated",
        detail:
          "Arena validated the authenticated wallet session and prepared the on-chain validation bet request.",
      },
      transaction: {
        chainId: input.chainId,
        to:
          marketView.executionReadiness?.contractAddress ??
          "0x0000000000000000000000000000000000000000",
        data: "0x",
        value: input.stakeAmount,
        chainMarketId:
          marketView.executionReadiness?.chainMarketId ??
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        selectedOption: input.selectedOption,
        stakeAmount: input.stakeAmount,
      },
    };
  }

  async placeBetForUser(
    input: PlacePositionBetInput,
  ): Promise<PlaceValidationBetResult> {
    const position = await this.deps.marketCommands.placeBet(input);
    const marketView = await this.getMarket(position.marketId, input.userId);

    if (!marketView) {
      throw new MarketViewNotAccessibleError(position.marketId);
    }

    return {
      marketView,
      positionId: position.id,
      execution: {
        mode: "wallet_authenticated_account_write",
        stage: "position_recorded",
        requiresWalletSignature: true,
        usesDemoFlow: false,
        chainId: input.chainId,
        txHash: null,
        submittedAt: input.placedAt,
        recordedAt: input.placedAt,
        statusLabel: "Position recorded",
        detail:
          "Arena validated the wallet-authenticated session and recorded the position through the account write path.",
      },
    };
  }

  private async buildMarketView(
    marketId: string,
    now: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) {
      throw new MarketNotFoundError(marketId);
    }

    const proposition = await this.deps.propositions.getById(market.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(market.propositionId);
    }

    const counter = await this.deps.counters.getByPropositionId(proposition.id);
    const currentUserPosition = userId
      ? await this.deps.positions.findByMarketAndUser(market.id, userId)
      : null;

    return buildValidationMarketViewModel({
      proposition,
      market,
      counter,
      currentUserPosition,
      now,
    });
  }
}
