import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { ethers, type ContractInterface, type providers, type utils } from "ethers";

import { resolveFromWorkspaceRoot } from "../../common/utils/workspace-root.util";
import { AppConfigService } from "../../config/app-config.service";
import type {
  ValidationContractMarketState,
  ValidationContractMarketView,
  ValidationChainLogQuery,
  ValidationChainParsedLog,
  ValidationChainSnapshot,
} from "./validation-chain.types";
import { ValidationChainContractError } from "./validation-chain.types";

interface ValidationArtifact {
  abi: ContractInterface;
}

type ValidationSignerRole = "operator" | "oracle" | "pauser";

@Injectable()
export class ValidationChainContractService {
  private readonly artifactPath = resolveFromWorkspaceRoot(
    "artifacts",
    "contracts",
    "validation",
    "ArenaValidationMarket.sol",
    "ArenaValidationMarket.json",
  );

  private readonly provider = new ethers.providers.JsonRpcProvider(
    this.config.rpcUrl,
    this.config.chainId,
  );

  private readonly artifact = this.loadArtifact();
  private readonly contractInterface = new ethers.utils.Interface(
    this.artifact.abi as never,
  );
  private readonly contract = new ethers.Contract(
    this.config.validationContractAddress,
    this.artifact.abi,
    this.provider,
  );

  constructor(private readonly config: AppConfigService) {}

  getProvider(): providers.JsonRpcProvider {
    return this.provider;
  }

  getArtifactPath(): string {
    return this.artifactPath;
  }

  getContractAddress(): string {
    return this.config.validationContractAddress;
  }

  getInterface(): utils.Interface {
    return this.contractInterface;
  }

  getReadOnlyContract(): ethers.Contract {
    return this.contract;
  }

  getSupportedEventTopics(): string[] {
    return [
      "MarketCreated",
      "MarketOpened",
      "BetPlaced",
      "MarketFrozen",
      "MarketResolved",
      "MarketCancelled",
      "Claimed",
      "Refunded",
      "Paused",
      "Unpaused",
    ].map((eventName) => this.contractInterface.getEventTopic(eventName));
  }

  getSnapshot(): ValidationChainSnapshot {
    return {
      rpcUrl: this.config.rpcUrl,
      configuredChainId: this.config.chainId,
      contractAddress: this.config.validationContractAddress,
      confirmations: this.config.validationSyncConfirmations,
      batchSize: this.config.validationSyncBatchSize,
      artifactPath: this.artifactPath,
    };
  }

  async assertReady(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== this.config.chainId) {
        throw new Error(
          `Configured chain id ${this.config.chainId} does not match provider chain id ${Number(network.chainId)}`,
        );
      }
    } catch (error) {
      throw this.wrapError("assertReady", error);
    }
  }

  async getLogs(query: ValidationChainLogQuery): Promise<providers.Log[]> {
    try {
      return await this.provider.getLogs({
        address: this.config.validationContractAddress,
        fromBlock: query.fromBlock,
        toBlock: query.toBlock,
        topics: query.topics,
      });
    } catch (error) {
      throw this.wrapError("getLogs", error);
    }
  }

  parseLog(log: Pick<providers.Log, "topics" | "data">): ValidationChainParsedLog {
    try {
      return this.contractInterface.parseLog(log);
    } catch (error) {
      throw this.wrapError("parseLog", error);
    }
  }

  async getMarket(marketId: string): Promise<unknown> {
    try {
      return await this.contract.getMarket(marketId);
    } catch (error) {
      throw this.wrapError("getMarket", error);
    }
  }

  async getMarketOrNull(
    marketId: string,
  ): Promise<ValidationContractMarketView | null> {
    try {
      const market = await this.contract.getMarket(marketId);
      return this.toMarketView(marketId, market);
    } catch (error) {
      if (this.isMarketNotFound(error)) {
        return null;
      }

      throw this.wrapError("getMarketOrNull", error);
    }
  }

  async getUserPosition(marketId: string, user: string): Promise<unknown> {
    try {
      return await this.contract.getUserPosition(marketId, user);
    } catch (error) {
      throw this.wrapError("getUserPosition", error);
    }
  }

  async claimableAmount(marketId: string, user: string): Promise<ethers.BigNumber> {
    try {
      return await this.contract.claimableAmount(marketId, user);
    } catch (error) {
      throw this.wrapError("claimableAmount", error);
    }
  }

  async getLatestBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      throw this.wrapError("getLatestBlockNumber", error);
    }
  }

  async getBlock(blockNumber: number): Promise<providers.Block> {
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (!block) {
        throw new Error(`Block ${blockNumber} was not found`);
      }

      return block;
    } catch (error) {
      throw this.wrapError("getBlock", error);
    }
  }

  async isPaused(): Promise<boolean> {
    try {
      return await this.contract.paused();
    } catch (error) {
      throw this.wrapError("isPaused", error);
    }
  }

  async sendCreateMarket(
    marketId: string,
    propositionId: string,
    minStake: string,
  ): Promise<providers.TransactionResponse> {
    return this.sendOperatorTransaction("createMarket", [
      marketId,
      propositionId,
      minStake,
    ]);
  }

  async sendOpenMarket(
    marketId: string,
  ): Promise<providers.TransactionResponse> {
    return this.sendOperatorTransaction("openMarket", [marketId]);
  }

  async sendFreezeMarket(
    marketId: string,
  ): Promise<providers.TransactionResponse> {
    return this.sendOperatorTransaction("freezeMarket", [marketId]);
  }

  async sendCancelMarket(
    marketId: string,
    reasonCode: string,
  ): Promise<providers.TransactionResponse> {
    return this.sendOperatorTransaction("cancelMarket", [marketId, reasonCode]);
  }

  async sendResolveMarket(payload: {
    marketId: string;
    propositionId: string;
    resultKind: number;
    winningOption: number;
    voidReason: number;
  }): Promise<providers.TransactionResponse> {
    return this.sendOracleTransaction("resolveMarket", [payload]);
  }

  async sendPause(): Promise<providers.TransactionResponse> {
    return this.sendPauserTransaction("pause", []);
  }

  async sendUnpause(): Promise<providers.TransactionResponse> {
    return this.sendPauserTransaction("unpause", []);
  }

  private loadArtifact(): ValidationArtifact {
    if (!existsSync(this.artifactPath)) {
      throw new ValidationChainContractError(
        "loadArtifact",
        `Validation contract artifact not found at ${this.artifactPath}. Run the root Hardhat build first.`,
      );
    }

    return JSON.parse(readFileSync(this.artifactPath, "utf8")) as ValidationArtifact;
  }

  private wrapError(
    operation: string,
    error: unknown,
  ): ValidationChainContractError {
    const details =
      error instanceof Error ? error.message : "Unknown validation contract error";

    return new ValidationChainContractError(
      operation,
      `Validation contract ${operation} failed: ${details}`,
      error,
    );
  }

  private getSignerPrivateKey(role: ValidationSignerRole): string {
    const privateKey =
      role === "operator"
        ? this.config.validationOperatorPrivateKey
        : role === "oracle"
          ? this.config.validationOraclePrivateKey
          : this.config.validationPauserPrivateKey;

    if (!privateKey || privateKey.trim().length === 0) {
      throw new ValidationChainContractError(
        `get${role}Signer`,
        `Validation ${role} private key is not configured`,
      );
    }

    return privateKey.trim();
  }

  private getWriteContract(role: ValidationSignerRole): ethers.Contract {
    const signer = new ethers.Wallet(
      this.getSignerPrivateKey(role),
      this.provider,
    );

    return new ethers.Contract(
      this.config.validationContractAddress,
      this.artifact.abi,
      signer,
    );
  }

  private async sendOperatorTransaction(
    method: string,
    args: unknown[],
  ): Promise<providers.TransactionResponse> {
    return this.sendWriteTransaction("operator", method, args);
  }

  private async sendOracleTransaction(
    method: string,
    args: unknown[],
  ): Promise<providers.TransactionResponse> {
    return this.sendWriteTransaction("oracle", method, args);
  }

  private async sendPauserTransaction(
    method: string,
    args: unknown[],
  ): Promise<providers.TransactionResponse> {
    return this.sendWriteTransaction("pauser", method, args);
  }

  private async sendWriteTransaction(
    role: ValidationSignerRole,
    method: string,
    args: unknown[],
  ): Promise<providers.TransactionResponse> {
    try {
      const contract = this.getWriteContract(role) as Record<string, unknown>;
      const contractMethod = contract[method];
      if (typeof contractMethod !== "function") {
        throw new Error(`Validation contract method ${method} is not available`);
      }

      return await (contractMethod as (...params: unknown[]) => Promise<providers.TransactionResponse>)(
        ...args,
      );
    } catch (error) {
      throw this.wrapError(`${role}.${method}`, error);
    }
  }

  private toMarketView(
    marketId: string,
    market: {
      propositionId: string;
      state: ValidationContractMarketState;
      minStake: ethers.BigNumber;
      resultKind: number;
      winningOption: number;
      voidReason: number;
      openedAt: number;
      frozenAt: number;
      resolvedAt: number;
      cancelledAt: number;
      cancelReasonCode: string;
    },
  ): ValidationContractMarketView {
    return {
      marketId,
      propositionId: market.propositionId,
      state: Number(market.state) as ValidationContractMarketState,
      minStake: market.minStake.toString(),
      resultKind: Number(market.resultKind) as ValidationContractMarketView["resultKind"],
      winningOption: Number(market.winningOption),
      voidReason: Number(market.voidReason) as ValidationContractMarketView["voidReason"],
      openedAt: Number(market.openedAt),
      frozenAt: Number(market.frozenAt),
      resolvedAt: Number(market.resolvedAt),
      cancelledAt: Number(market.cancelledAt),
      cancelReasonCode: market.cancelReasonCode,
    };
  }

  private isMarketNotFound(error: unknown): boolean {
    const errorData = this.extractErrorData(error);
    if (errorData) {
      try {
        return this.contractInterface.parseError(errorData).name === "MarketNotFound";
      } catch {
        // Continue to message fallback.
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return /MarketNotFound|market not found/i.test(message);
  }

  private extractErrorData(error: unknown): string | null {
    if (typeof error !== "object" || error === null) {
      return null;
    }

    const candidate = error as {
      data?: string;
      error?: { data?: string };
    };

    return candidate.data ?? candidate.error?.data ?? null;
  }
}
