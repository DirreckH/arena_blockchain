import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";
import type {
  PrepareValidationBetResult,
  PlaceValidationBetResult,
  ValidationBetExecutionViewModel,
  ValidationMarketViewModel,
} from "@arena/shared";

import { AppConfigService } from "../../config/app-config.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import { toSharedCounter, toSharedMarket, toSharedPositionBet, toSharedProposition } from "../arena-view.mapper";
import type { PlaceBetInput } from "../arena.types";
import { assertBinaryOption, assertNonNegativeIntegerString, toDate } from "../arena.utils";
import { BetRepository } from "../repositories/bet.repository";
import { EffectiveSampleCounterRepository } from "../repositories/effective-sample-counter.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { buildValidationMarketViewModel } from "@arena/shared";
import { ValidationChainContractService } from "../validation-chain/validation-chain-contract.service";
import { ValidationChainIdService } from "../validation-chain/validation-chain-id.service";
import { BetService } from "./bet.service";

type ValidateBetInput = PlaceBetInput;

@Injectable()
export class ValidationBetExecutionService {
  constructor(
    private readonly config: AppConfigService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly bets: BetRepository,
    private readonly betService: BetService,
    private readonly validationChainIds: ValidationChainIdService,
    private readonly validationContract: ValidationChainContractService,
  ) {}

  async prepare(input: ValidateBetInput): Promise<PrepareValidationBetResult> {
    const context = await this.validateAndBuildContext(input);
    const execution = this.buildExecutionView({
      chainId: input.chainId ?? this.config.chainId,
      placedAt: input.placedAt,
      stage: "session_validated",
      statusLabel: "Wallet session validated",
      detail:
        "Arena validated the authenticated wallet session and prepared the on-chain validation bet request.",
    });

    return {
      marketView: context.marketView,
      execution,
      transaction: {
        chainId: input.chainId ?? this.config.chainId,
        to: this.config.validationContractAddress,
        data: this.validationContract.getReadOnlyContract().interface.encodeFunctionData(
          "placeBet",
          [context.chainMarketId, input.selectedOption],
        ),
        value: input.stakeAmount,
        chainMarketId: context.chainMarketId,
        selectedOption: input.selectedOption,
        stakeAmount: input.stakeAmount,
      },
    };
  }

  async confirm(input: ValidateBetInput & { txHash: string }): Promise<PlaceValidationBetResult> {
    const context = await this.validateAndBuildContext(input, {
      allowExistingProjectedBet: true,
    });
    const receipt = await this.validationContract.getTransactionReceipt(input.txHash);

    if (!receipt || receipt.status !== 1) {
      throw new ArenaValidationError(
        "bet.transaction_not_confirmed",
        "The submitted transaction has not been confirmed successfully on chain",
      );
    }

    const event = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== this.config.validationContractAddress.toLowerCase()) {
        return false;
      }

      try {
        const parsed = this.validationContract.parseLog({
          data: log.data,
          topics: log.topics,
        });
        if (parsed.name !== "BetPlaced") {
          return false;
        }

        return (
          parsed.args.marketId === context.chainMarketId &&
          Number(parsed.args.selectedOption) === input.selectedOption &&
          parsed.args.amount.toString() === input.stakeAmount &&
          String(parsed.args.user).toLowerCase() === input.userId.toLowerCase()
        );
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new ArenaValidationError(
        "bet.transaction_mismatch",
        "The submitted transaction did not produce a matching validation-chain BetPlaced event",
      );
    }

    const existingBet = await this.bets.findByMarketAndUser(input.marketId, input.userId);
    const created =
      existingBet ??
      await this.betService.placeBet(input);
    const refreshedMarket = await this.buildMarketView(context.market.id, input.userId);

    return {
      marketView: refreshedMarket,
      positionId: created.id,
      execution: {
        ...this.buildExecutionView({
          chainId: input.chainId ?? this.config.chainId,
          placedAt: input.placedAt,
          stage: "position_recorded",
          statusLabel: "Position recorded",
          detail:
            "Arena verified the on-chain validation bet transaction and recorded the matching local position.",
        }),
        mode: "wallet_direct_contract_write",
        txHash: input.txHash,
      },
    };
  }

  private async validateAndBuildContext(
    input: ValidateBetInput,
    options: {
      allowExistingProjectedBet?: boolean;
    } = {},
  ): Promise<{
    marketView: ValidationMarketViewModel;
    market: Awaited<ReturnType<MarketRepository["findById"]>> extends infer T ? NonNullable<T> : never;
    chainMarketId: string;
  }> {
    assertBinaryOption(input.selectedOption, "selectedOption");
    assertNonNegativeIntegerString(input.stakeAmount, "stakeAmount");

    const targetChainId = input.chainId ?? this.config.chainId;
    if (targetChainId !== this.config.chainId) {
      throw new ArenaValidationError(
        "bet.chain_id_mismatch",
        "Bets can only be recorded for the configured validation chain",
      );
    }

    const proposition = await this.propositions.findById(input.propositionId);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${input.propositionId} was not found`,
      );
    }

    const market = await this.markets.findById(input.marketId);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${input.marketId} was not found`,
      );
    }

    if (market.propositionId !== proposition.id || input.propositionId !== market.propositionId) {
      throw new ArenaValidationError(
        "bet.market_mismatch",
        "The bet market does not belong to the specified proposition",
      );
    }

    if (proposition.status !== "live" || market.status !== "live") {
      throw new ArenaValidationError(
        "bet.market_not_live",
        "Bets can only be placed while the market and proposition are live",
      );
    }

    if (BigInt(input.stakeAmount) < BigInt(proposition.minBetAmount)) {
      throw new ArenaValidationError(
        "bet.below_minimum",
        "Bet amount is below the proposition minimum",
      );
    }

    const existing = await this.bets.findByMarketAndUser(input.marketId, input.userId);
    if (existing) {
      if (
        options.allowExistingProjectedBet &&
        existing.selectedOption === input.selectedOption &&
        existing.stakeAmount === input.stakeAmount
      ) {
        const marketView = await this.buildMarketView(market.id, input.userId);
        return { marketView, market, chainMarketId: market.chainMarketId ?? this.validationChainIds.buildChainMarketId(market.id) };
      }

      throw new ArenaConflictError(
        "bet.duplicate_position",
        "The user already has a bet for this market",
      );
    }

    const chainMarketId =
      market.chainMarketId ?? this.validationChainIds.buildChainMarketId(market.id);

    if (!market.chainMarketId || market.chainStatus !== "live") {
      throw new ArenaValidationError(
        "bet.chain_market_not_ready",
        "This validation market is not yet ready for live on-chain betting",
      );
    }

    const marketView = await this.buildMarketView(market.id, input.userId);
    return { marketView, market, chainMarketId };
  }

  private async buildMarketView(
    marketId: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel> {
    const market = await this.markets.findById(marketId);
    if (!market) {
      throw new ArenaNotFoundError("market.not_found", `Market ${marketId} was not found`);
    }

    const proposition = await this.propositions.findById(market.propositionId);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${market.propositionId} was not found`,
      );
    }

    const counter = await this.counters.findByPropositionId(proposition.id);
    const currentUserPosition = userId
      ? await this.bets.findByMarketAndUser(market.id, userId)
      : null;

    return buildValidationMarketViewModel({
      proposition: toSharedProposition(proposition),
      market: toSharedMarket(market),
      counter: toSharedCounter(counter),
      currentUserPosition: toSharedPositionBet(currentUserPosition),
      now: new Date().toISOString(),
      chainId: this.config.chainId,
      contractAddress: this.config.validationContractAddress,
    });
  }

  private buildExecutionView(input: {
    chainId: number;
    placedAt: string | Date;
    stage: ValidationBetExecutionViewModel["stage"];
    statusLabel: string;
    detail: string;
  }): ValidationBetExecutionViewModel {
    const placedAt = toDate(input.placedAt);

    return {
      mode: "wallet_direct_contract_write",
      stage: input.stage,
      requiresWalletSignature: true,
      usesDemoFlow: false,
      chainId: input.chainId,
      txHash: null,
      submittedAt: placedAt.toISOString(),
      recordedAt: placedAt.toISOString(),
      statusLabel: input.statusLabel,
      detail: input.detail,
    };
  }
}
