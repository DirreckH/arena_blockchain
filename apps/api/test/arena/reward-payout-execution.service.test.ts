import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ethers, type providers } from "ethers";

import { ArenaValidationError } from "../../src/arena/arena.errors";
import { RewardPayoutExecutionService } from "../../src/arena/services/reward-payout-execution.service";

const rewardPayoutInput = {
  method: "wallet_transfer" as const,
  chainId: 1,
  amount: "25",
  destinationAddress: "0x00000000000000000000000000000000000000b1",
  assetSymbol: "USDC",
  executionTxHash:
    "0x00000000000000000000000000000000000000000000000000000000000000c1",
};

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 1,
    rewardPayoutErc20Address: "0x0000000000000000000000000000000000000010",
    rewardPayoutOperatorPrivateKey:
      "0x4444444444444444444444444444444444444444444444444444444444444444",
    rewardPayoutConfirmationCount: 1,
    ...overrides,
  } as any;
}

function createProviderDouble(input: {
  configuredChainId?: number;
  receipt?: providers.TransactionReceipt | null;
}) {
  return {
    async getNetwork() {
      return {
        chainId: input.configuredChainId ?? 1,
      };
    },
    async getTransactionReceipt() {
      return input.receipt ?? null;
    },
  };
}

function createTransferReceipt(input: {
  tokenAddress: string;
  txHash: string;
  to: string;
  amount: string;
  confirmations?: number;
  status?: number;
}): providers.TransactionReceipt {
  const iface = new ethers.utils.Interface([
    "event Transfer(address indexed from,address indexed to,uint256 value)",
  ]);
  const transfer = iface.encodeEventLog(iface.getEvent("Transfer"), [
    "0x00000000000000000000000000000000000000aa",
    input.to,
    input.amount,
  ]);

  return {
    to: input.tokenAddress,
    from: "0x00000000000000000000000000000000000000aa",
    contractAddress: null,
    transactionIndex: 0,
    gasUsed: ethers.BigNumber.from(0),
    logsBloom: "0x",
    blockHash: "0xabc",
    transactionHash: input.txHash,
    logs: [
      {
        transactionIndex: 0,
        blockNumber: 10,
        transactionHash: input.txHash,
        address: input.tokenAddress,
        topics: transfer.topics,
        data: transfer.data,
        logIndex: 0,
        blockHash: "0xabc",
        removed: false,
      } as providers.Log,
    ],
    blockNumber: 10,
    confirmations: input.confirmations ?? 1,
    cumulativeGasUsed: ethers.BigNumber.from(0),
    effectiveGasPrice: ethers.BigNumber.from(0),
    byzantium: true,
    type: 2,
    status: input.status ?? 1,
  } as providers.TransactionReceipt;
}

describe("RewardPayoutExecutionService", () => {
  it("executeWalletTransfer rejects unsupported payout methods", async () => {
    const service = new RewardPayoutExecutionService(createConfig());

    await assert.rejects(
      () =>
        service.executeWalletTransfer({
          ...rewardPayoutInput,
          method: "bank_transfer",
        } as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.unsupported_method");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects payout chain mismatches", async () => {
    const service = new RewardPayoutExecutionService(createConfig());

    await assert.rejects(
      () =>
        service.executeWalletTransfer({
          ...rewardPayoutInput,
          chainId: 137,
        } as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.chain_id_mismatch");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects invalid destination wallet addresses", async () => {
    const service = new RewardPayoutExecutionService(createConfig());

    await assert.rejects(
      () =>
        service.executeWalletTransfer({
          ...rewardPayoutInput,
          destinationAddress: "not-an-address",
        } as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.invalid_destination_address");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects zero-value transfers", async () => {
    const service = new RewardPayoutExecutionService(createConfig());

    await assert.rejects(
      () =>
        service.executeWalletTransfer({
          ...rewardPayoutInput,
          amount: "0",
        } as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.invalid_amount");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects payouts when the token contract is not configured", async () => {
    const service = new RewardPayoutExecutionService(
      createConfig({
        rewardPayoutErc20Address: "   ",
      }),
    );

    await assert.rejects(
      () => service.executeWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.token_not_configured");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects payouts when the operator signer is not configured", async () => {
    const service = new RewardPayoutExecutionService(
      createConfig({
        rewardPayoutOperatorPrivateKey: "   ",
      }),
    );

    await assert.rejects(
      () => service.executeWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.signer_not_configured");
        return true;
      },
    );
  });

  it("executeWalletTransfer rejects provider chain mismatches before broadcast", async () => {
    const config = createConfig();
    const service = new RewardPayoutExecutionService(config);
    (service as any).provider = createProviderDouble({
      configuredChainId: 8453,
    });

    await assert.rejects(
      () => service.executeWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.provider_chain_mismatch");
        return true;
      },
    );
  });

  it("executeWalletTransfer wraps broadcast failures with a payout-specific validation error", async () => {
    const config = createConfig();
    const service = new RewardPayoutExecutionService(config);
    (service as any).provider = createProviderDouble({});
    (service as any).getWriteContract = (tokenAddress: string) => {
      assert.equal(tokenAddress, config.rewardPayoutErc20Address);

      return {
        async transfer() {
          throw new Error("insufficient funds for gas * price + value");
        },
      };
    };

    await assert.rejects(
      () => service.executeWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.execution_broadcast_failed");
        assert.equal(
          error.message,
          "USDC reward payout transfer failed: insufficient funds for gas * price + value",
        );
        return true;
      },
    );
  });

  it("executeWalletTransfer forwards payout transfers to the configured ERC20 contract and returns the tx hash", async () => {
    const config = createConfig();
    const service = new RewardPayoutExecutionService(config);
    let receivedDestinationAddress: string | null = null;
    let receivedAmount: string | null = null;
    (service as any).provider = createProviderDouble({});
    (service as any).getWriteContract = (tokenAddress: string) => {
      assert.equal(tokenAddress, config.rewardPayoutErc20Address);

      return {
        async transfer(destinationAddress: string, amount: ethers.BigNumber) {
          receivedDestinationAddress = destinationAddress;
          receivedAmount = amount.toString();
          return {
            hash: rewardPayoutInput.executionTxHash,
          };
        },
      };
    };

    const result = await service.executeWalletTransfer(rewardPayoutInput as any);

    assert.deepEqual(result, {
      executionTxHash: rewardPayoutInput.executionTxHash,
      externalReference: null,
    });
    assert.equal(
      receivedDestinationAddress,
      rewardPayoutInput.destinationAddress,
    );
    assert.equal(receivedAmount, rewardPayoutInput.amount);
  });

  it("verifyWalletTransfer rejects unconfirmed payout receipts", async () => {
    const config = createConfig({
      rewardPayoutConfirmationCount: 2,
    });
    const service = new RewardPayoutExecutionService(config);
    (service as any).provider = createProviderDouble({
      receipt: createTransferReceipt({
        tokenAddress: config.rewardPayoutErc20Address,
        txHash: rewardPayoutInput.executionTxHash,
        to: rewardPayoutInput.destinationAddress,
        amount: rewardPayoutInput.amount,
        confirmations: 1,
      }),
    });

    await assert.rejects(
      () => service.verifyWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.transaction_not_confirmed");
        return true;
      },
    );
  });

  it("verifyWalletTransfer rejects receipts without a matching transfer event", async () => {
    const config = createConfig();
    const service = new RewardPayoutExecutionService(config);
    (service as any).provider = createProviderDouble({
      receipt: createTransferReceipt({
        tokenAddress: config.rewardPayoutErc20Address,
        txHash: rewardPayoutInput.executionTxHash,
        to: "0x00000000000000000000000000000000000000ff",
        amount: rewardPayoutInput.amount,
        confirmations: 2,
      }),
    });

    await assert.rejects(
      () => service.verifyWalletTransfer(rewardPayoutInput as any),
      (error: unknown) => {
        assert.ok(error instanceof ArenaValidationError);
        assert.equal(error.code, "reward_payout.transaction_mismatch");
        return true;
      },
    );
  });

  it("verifyWalletTransfer accepts receipts with enough confirmations and a matching transfer event", async () => {
    const config = createConfig({
      rewardPayoutConfirmationCount: 2,
    });
    const service = new RewardPayoutExecutionService(config);
    (service as any).provider = createProviderDouble({
      receipt: createTransferReceipt({
        tokenAddress: config.rewardPayoutErc20Address,
        txHash: rewardPayoutInput.executionTxHash,
        to: rewardPayoutInput.destinationAddress,
        amount: rewardPayoutInput.amount,
        confirmations: 2,
      }),
    });

    await assert.doesNotReject(() =>
      service.verifyWalletTransfer(rewardPayoutInput as any),
    );
  });
});
