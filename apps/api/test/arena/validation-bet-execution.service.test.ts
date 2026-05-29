import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ethers, type providers } from "ethers";

import { ArenaValidationError } from "../../src/arena/arena.errors";
import { ValidationBetExecutionService } from "../../src/arena/services/validation-bet-execution.service";
import { createArenaHarness } from "./harness";

const propositionDraftInput = {
  category: "general" as const,
  title: "Validation execution proposition",
  description: "desc",
  options: ["Yes", "No"] as [string, string],
  sampleConstraints: [],
  minEffectiveSample: 1,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 600,
  rewardBudget: "0",
  baseResponseReward: "0",
  createdByUserId: "admin_1",
  marketEnabled: true,
};

const toBytes32MarketId = (marketId: string) =>
  ethers.utils.hexZeroPad(ethers.utils.id(marketId), 32);

async function createLiveValidationMarket() {
  const harness = createArenaHarness();
  const draft = await harness.propositionEngineService.createProposition(
    propositionDraftInput,
  );
  const scheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: draft.id,
      publishedAt: "2026-05-26T00:00:00.000Z",
      updatedByUserId: "admin_1",
    });
  const proposition = await harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-05-26T00:01:00.000Z",
    updatedByUserId: "admin_1",
  });

  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);
  const chainMarketId = toBytes32MarketId(market.id);

  await harness.marketRepository.update(market.id, {
    status: "live",
    chainMarketId,
    chainStatus: "live",
    liveAt: new Date("2026-05-26T00:01:00.000Z"),
    chainOpenedAt: new Date("2026-05-26T00:01:10.000Z"),
  });

  const refreshedMarket = await harness.marketRepository.findById(market.id);
  assert.ok(refreshedMarket);

  return {
    harness,
    proposition,
    market: refreshedMarket,
  };
}

function createValidationContractDouble(input: {
  expectedContractAddress: string;
  marketId: string;
  selectedOption: 0 | 1;
  stakeAmount: string;
  userAddress: string;
  txHash?: string;
  receiptStatus?: number;
}) {
  const iface = new ethers.utils.Interface([
    "function placeBet(bytes32 marketId,uint8 selectedOption) payable",
    "event BetPlaced(bytes32 indexed marketId,address indexed user,uint8 selectedOption,uint256 amount)",
  ]);

  const encodedEvent = iface.encodeEventLog(iface.getEvent("BetPlaced"), [
    input.marketId,
    input.userAddress,
    input.selectedOption,
    input.stakeAmount,
  ]);

  return {
    getReadOnlyContract() {
      return {
        interface: iface,
      };
    },
    async getTransactionReceipt(
      txHash: string,
    ): Promise<providers.TransactionReceipt | null> {
      if (input.txHash && txHash !== input.txHash) {
        return null;
      }

      return {
        to: input.expectedContractAddress,
        from: input.userAddress,
        contractAddress: null,
        transactionIndex: 0,
        gasUsed: ethers.BigNumber.from(0),
        logsBloom: "0x",
        blockHash: "0xabc",
        transactionHash: txHash,
        logs: [
          {
            transactionIndex: 0,
            blockNumber: 1,
            transactionHash: txHash,
            address: input.expectedContractAddress,
            topics: encodedEvent.topics,
            data: encodedEvent.data,
            logIndex: 0,
            blockHash: "0xabc",
            removed: false,
          } as providers.Log,
        ],
        blockNumber: 1,
        confirmations: 1,
        cumulativeGasUsed: ethers.BigNumber.from(0),
        effectiveGasPrice: ethers.BigNumber.from(0),
        byzantium: true,
        type: 2,
        status: input.receiptStatus ?? 1,
      } as providers.TransactionReceipt;
    },
    parseLog(log: Pick<providers.Log, "topics" | "data">) {
      return iface.parseLog(log);
    },
  };
}

describe("ValidationBetExecutionService", () => {
  it("prepare returns a contract-write request for a live validation market", async () => {
    const { harness, proposition, market } = await createLiveValidationMarket();
    const service = new ValidationBetExecutionService(
      harness.config as any,
      harness.propositionRepository as any,
      harness.marketRepository as any,
      harness.counterRepository as any,
      harness.betRepository as any,
      harness.betService as any,
      harness.validationChainIdService as any,
      createValidationContractDouble({
        expectedContractAddress: harness.config.validationContractAddress,
        marketId: market.chainMarketId!,
        selectedOption: 0,
        stakeAmount: "20",
        userAddress: "0x00000000000000000000000000000000000000a1",
      }) as any,
    );

    const prepared = await service.prepare({
      propositionId: proposition.id,
      marketId: market.id,
      userId: "0x00000000000000000000000000000000000000a1",
      chainId: 1,
      selectedOption: 0,
      stakeAmount: "20",
      placedAt: "2026-05-26T00:02:00.000Z",
    });

    assert.equal(prepared.execution.mode, "wallet_direct_contract_write");
    assert.equal(prepared.execution.stage, "session_validated");
    assert.equal(prepared.transaction.to, harness.config.validationContractAddress);
    assert.equal(prepared.transaction.chainMarketId, market.chainMarketId);
    assert.equal(prepared.transaction.stakeAmount, "20");
    assert.match(prepared.transaction.data, /^0x[0-9a-f]+$/i);
  });

  it("confirm records a local position when the receipt contains the matching BetPlaced event", async () => {
    const { harness, proposition, market } = await createLiveValidationMarket();
    const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const service = new ValidationBetExecutionService(
      harness.config as any,
      harness.propositionRepository as any,
      harness.marketRepository as any,
      harness.counterRepository as any,
      harness.betRepository as any,
      harness.betService as any,
      harness.validationChainIdService as any,
      createValidationContractDouble({
        expectedContractAddress: harness.config.validationContractAddress,
        marketId: market.chainMarketId!,
        selectedOption: 1,
        stakeAmount: "25",
        userAddress: "0x00000000000000000000000000000000000000a2",
        txHash,
      }) as any,
    );

    const confirmed = await service.confirm({
      propositionId: proposition.id,
      marketId: market.id,
      userId: "0x00000000000000000000000000000000000000a2",
      chainId: 1,
      selectedOption: 1,
      stakeAmount: "25",
      placedAt: "2026-05-26T00:03:00.000Z",
      txHash,
    });

    assert.equal(confirmed.execution.mode, "wallet_direct_contract_write");
    assert.equal(confirmed.execution.stage, "position_recorded");
    assert.equal(confirmed.execution.txHash, txHash);
    assert.equal(confirmed.marketView.currentUserPosition?.stakeAmount, "25");
    assert.equal(confirmed.marketView.currentUserPosition?.selectedOption, 1);

    const persistedBet = await harness.betRepository.findByMarketAndUser(
      market.id,
      "0x00000000000000000000000000000000000000a2",
    );
    assert.ok(persistedBet);
    assert.equal(persistedBet.stakeAmount, "25");
    assert.equal(persistedBet.selectedOption, 1);
  });

  it("confirm rejects receipts whose BetPlaced event does not match the expected stake", async () => {
    const { harness, proposition, market } = await createLiveValidationMarket();
    const txHash = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const service = new ValidationBetExecutionService(
      harness.config as any,
      harness.propositionRepository as any,
      harness.marketRepository as any,
      harness.counterRepository as any,
      harness.betRepository as any,
      harness.betService as any,
      harness.validationChainIdService as any,
      createValidationContractDouble({
        expectedContractAddress: harness.config.validationContractAddress,
        marketId: market.chainMarketId!,
        selectedOption: 0,
        stakeAmount: "25",
        userAddress: "0x00000000000000000000000000000000000000a3",
        txHash,
      }) as any,
    );

    await assert.rejects(
      () => service.confirm({
        propositionId: proposition.id,
        marketId: market.id,
        userId: "0x00000000000000000000000000000000000000a3",
        chainId: 1,
        selectedOption: 0,
        stakeAmount: "20",
        placedAt: "2026-05-26T00:03:00.000Z",
        txHash,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "bet.transaction_mismatch");
        return true;
      },
    );
  });

  it("confirm is idempotent when chain projection already created the matching local bet", async () => {
    const { harness, proposition, market } = await createLiveValidationMarket();
    const txHash = "0x3333333333333333333333333333333333333333333333333333333333333333";

    await harness.betRepository.create({
      id: "bet_projected_existing",
      marketId: market.id,
      propositionId: proposition.id,
      userId: "0x00000000000000000000000000000000000000a4",
      selectedOption: 1,
      stakeAmount: "30",
      status: "placed",
      placedAt: new Date("2026-05-26T00:03:00.000Z"),
      chainSyncedAt: new Date("2026-05-26T00:03:05.000Z"),
    });

    const service = new ValidationBetExecutionService(
      harness.config as any,
      harness.propositionRepository as any,
      harness.marketRepository as any,
      harness.counterRepository as any,
      harness.betRepository as any,
      harness.betService as any,
      harness.validationChainIdService as any,
      createValidationContractDouble({
        expectedContractAddress: harness.config.validationContractAddress,
        marketId: market.chainMarketId!,
        selectedOption: 1,
        stakeAmount: "30",
        userAddress: "0x00000000000000000000000000000000000000a4",
        txHash,
      }) as any,
    );

    const confirmed = await service.confirm({
      propositionId: proposition.id,
      marketId: market.id,
      userId: "0x00000000000000000000000000000000000000a4",
      chainId: 1,
      selectedOption: 1,
      stakeAmount: "30",
      placedAt: "2026-05-26T00:03:00.000Z",
      txHash,
    });

    assert.equal(confirmed.positionId, "bet_projected_existing");

    const allBets = await harness.betRepository.listByMarketId(market.id);
    assert.equal(allBets.length, 1);
  });
});
