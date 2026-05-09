import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { ethers, type ContractInterface } from "ethers";

import type { ChainSnapshot } from "@arena/shared";

import { resolveFromWorkspaceRoot } from "../common/utils/workspace-root.util";
import { AppConfigService } from "../config/app-config.service";

interface ArenaArtifact {
  abi: ContractInterface;
}

@Injectable()
export class BlockchainService {
  private readonly primaryArtifactPath = resolveFromWorkspaceRoot(
    "artifacts",
    "contracts",
    "Arena.sol",
    "Arena.json",
  );

  private readonly legacyArtifactPath = resolveFromWorkspaceRoot(
    "packages",
    "contracts",
    "artifacts",
    "contracts",
    "Arena.sol",
    "Arena.json",
  );

  private readonly provider = new ethers.providers.JsonRpcProvider(
    this.config.rpcUrl,
    this.config.chainId,
  );

  constructor(private readonly config: AppConfigService) {}

  getProvider(): ethers.providers.JsonRpcProvider {
    return this.provider;
  }

  getArenaArtifact(): ArenaArtifact {
    const artifactPath = this.resolveArtifactPath();

    if (!existsSync(artifactPath)) {
      throw new Error(
        `Arena contract artifact not found at ${this.primaryArtifactPath}. Run the root Hardhat build first.`,
      );
    }

    return JSON.parse(readFileSync(artifactPath, "utf8")) as ArenaArtifact;
  }

  getArenaContract(): ethers.Contract {
    return new ethers.Contract(
      this.config.arenaContractAddress,
      this.getArenaArtifact().abi,
      this.provider,
    );
  }

  async getChainSnapshot(): Promise<ChainSnapshot> {
    const network = await this.provider.getNetwork();

    return {
      rpcUrl: this.config.rpcUrl,
      configuredChainId: this.config.chainId,
      connectedChainId: Number(network.chainId),
      contractAddress: this.config.arenaContractAddress,
      artifactPath: this.resolveArtifactPath(),
    };
  }

  async assertReady(): Promise<void> {
    const snapshot = await this.getChainSnapshot();

    if (snapshot.connectedChainId !== snapshot.configuredChainId) {
      throw new Error(
        `Configured chain id ${snapshot.configuredChainId} does not match provider chain id ${snapshot.connectedChainId}`,
      );
    }

    this.getArenaArtifact();
  }

  private resolveArtifactPath(): string {
    if (existsSync(this.primaryArtifactPath)) {
      return this.primaryArtifactPath;
    }

    if (existsSync(this.legacyArtifactPath)) {
      return this.legacyArtifactPath;
    }

    return this.primaryArtifactPath;
  }
}
