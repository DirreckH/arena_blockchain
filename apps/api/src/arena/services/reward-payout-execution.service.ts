import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";
import type { RewardPayout } from "@prisma/client";
import type { providers } from "ethers";

import { AppConfigService } from "../../config/app-config.service";
import { ArenaValidationError } from "../arena.errors";
import { assertNonNegativeIntegerString } from "../arena.utils";

export interface RewardPayoutExecutionResult {
  executionTxHash: string;
  externalReference: string | null;
}

@Injectable()
export class RewardPayoutExecutionService {
  private readonly provider = new ethers.providers.JsonRpcProvider(
    this.config.rpcUrl,
    this.config.chainId,
  );

  constructor(private readonly config: AppConfigService) {}

  async executeWalletTransfer(
    payout: Pick<
      RewardPayout,
      | "method"
      | "chainId"
      | "amount"
      | "destinationAddress"
      | "assetSymbol"
    >,
  ): Promise<RewardPayoutExecutionResult> {
    if (payout.method !== "wallet_transfer") {
      throw new ArenaValidationError(
        "reward_payout.unsupported_method",
        `Reward payout method ${payout.method} is not supported for automatic execution`,
      );
    }

    if (payout.chainId !== this.config.chainId) {
      throw new ArenaValidationError(
        "reward_payout.chain_id_mismatch",
        "Reward payouts can only execute on the configured chain",
      );
    }

    if (!ethers.utils.isAddress(payout.destinationAddress)) {
      throw new ArenaValidationError(
        "reward_payout.invalid_destination_address",
        "Reward payout destination wallet address is invalid",
      );
    }

    assertNonNegativeIntegerString(payout.amount, "reward_payout.amount");
    if (payout.amount === "0") {
      throw new ArenaValidationError(
        "reward_payout.invalid_amount",
        "Reward payouts require a non-zero transfer amount",
      );
    }

    const tokenAddress = this.getTokenAddress();
    const signerPrivateKey = this.getSignerPrivateKey();
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== this.config.chainId) {
      throw new ArenaValidationError(
        "reward_payout.provider_chain_mismatch",
        `Configured chain id ${this.config.chainId} does not match provider chain id ${Number(network.chainId)}`,
      );
    }

    try {
      const contract = this.getWriteContract(tokenAddress, signerPrivateKey);

      // Reward amounts are stored as token base units and can be forwarded directly.
      const tx = await contract.transfer(
        payout.destinationAddress,
        ethers.BigNumber.from(payout.amount),
      );

      return {
        executionTxHash: tx.hash,
        externalReference: null,
      };
    } catch (error) {
      throw new ArenaValidationError(
        "reward_payout.execution_broadcast_failed",
        this.formatExecutionFailureMessage(error, payout.assetSymbol),
      );
    }
  }

  async verifyWalletTransfer(
    payout: Pick<
      RewardPayout,
      | "method"
      | "chainId"
      | "amount"
      | "destinationAddress"
      | "assetSymbol"
      | "executionTxHash"
    >,
  ): Promise<void> {
    if (payout.method !== "wallet_transfer") {
      throw new ArenaValidationError(
        "reward_payout.unsupported_method",
        `Reward payout method ${payout.method} is not supported for automatic verification`,
      );
    }

    if (!payout.executionTxHash) {
      throw new ArenaValidationError(
        "reward_payout.execution_tx_hash_required",
        "Wallet transfer payouts require an execution transaction hash before completion",
      );
    }

    if (!ethers.utils.isHexString(payout.executionTxHash, 32)) {
      throw new ArenaValidationError(
        "reward_payout.invalid_execution_tx_hash",
        "Reward payout execution transaction hash must be a 32-byte hex value",
      );
    }

    if (payout.chainId !== this.config.chainId) {
      throw new ArenaValidationError(
        "reward_payout.chain_id_mismatch",
        "Reward payouts can only execute on the configured chain",
      );
    }

    if (!ethers.utils.isAddress(payout.destinationAddress)) {
      throw new ArenaValidationError(
        "reward_payout.invalid_destination_address",
        "Reward payout destination wallet address is invalid",
      );
    }

    assertNonNegativeIntegerString(payout.amount, "reward_payout.amount");
    if (payout.amount === "0") {
      throw new ArenaValidationError(
        "reward_payout.invalid_amount",
        "Reward payouts require a non-zero transfer amount",
      );
    }

    const tokenAddress = this.getTokenAddress();
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== this.config.chainId) {
      throw new ArenaValidationError(
        "reward_payout.provider_chain_mismatch",
        `Configured chain id ${this.config.chainId} does not match provider chain id ${Number(network.chainId)}`,
      );
    }

    const receipt = await this.provider.getTransactionReceipt(
      payout.executionTxHash,
    );
    if (!receipt || receipt.status !== 1) {
      throw new ArenaValidationError(
        "reward_payout.transaction_not_confirmed",
        "The submitted reward payout transaction has not been confirmed successfully on chain",
      );
    }

    if (
      typeof receipt.confirmations === "number" &&
      receipt.confirmations < this.config.rewardPayoutConfirmationCount
    ) {
      throw new ArenaValidationError(
        "reward_payout.transaction_not_confirmed",
        `Reward payout transaction requires ${this.config.rewardPayoutConfirmationCount} confirmation(s) before completion`,
      );
    }

    const matchedTransfer = this.findMatchingTransferLog(
      receipt,
      tokenAddress,
      payout.destinationAddress,
      payout.amount,
    );

    if (!matchedTransfer) {
      throw new ArenaValidationError(
        "reward_payout.transaction_mismatch",
        "The submitted reward payout transaction did not emit a matching ERC20 Transfer event",
      );
    }
  }

  private getTokenAddress(): string {
    const tokenAddress = this.config.rewardPayoutErc20Address.trim();
    if (!tokenAddress) {
      throw new ArenaValidationError(
        "reward_payout.token_not_configured",
        "Reward payout ERC20 token address is not configured",
      );
    }

    return tokenAddress;
  }

  private getSignerPrivateKey(): string {
    const privateKey = this.config.rewardPayoutOperatorPrivateKey.trim();
    if (!privateKey) {
      throw new ArenaValidationError(
        "reward_payout.signer_not_configured",
        "Reward payout operator private key is not configured",
      );
    }

    return privateKey;
  }

  private getWriteContract(
    tokenAddress: string,
    signerPrivateKey: string,
  ): ethers.Contract {
    const signer = new ethers.Wallet(signerPrivateKey, this.provider);

    return new ethers.Contract(
      tokenAddress,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      signer,
    );
  }

  private findMatchingTransferLog(
    receipt: providers.TransactionReceipt,
    tokenAddress: string,
    destinationAddress: string,
    amount: string,
  ): providers.Log | undefined {
    const iface = new ethers.utils.Interface([
      "event Transfer(address indexed from,address indexed to,uint256 value)",
    ]);
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    const normalizedDestinationAddress = destinationAddress.toLowerCase();

    return receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== normalizedTokenAddress) {
        return false;
      }

      try {
        const parsed = iface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsed.name !== "Transfer") {
          return false;
        }

        return (
          String(parsed.args.to).toLowerCase() === normalizedDestinationAddress &&
          parsed.args.value.toString() === amount
        );
      } catch {
        return false;
      }
    });
  }

  private formatExecutionFailureMessage(
    error: unknown,
    assetSymbol: string,
  ): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return `${assetSymbol} reward payout transfer failed: ${error.message}`;
    }

    return `${assetSymbol} reward payout transfer failed during broadcast`;
  }
}
