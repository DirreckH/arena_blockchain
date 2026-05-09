import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";

import { AppConfigService } from "../../config/app-config.service";

type ValidationEntityNamespace = "proposition" | "market";

@Injectable()
export class ValidationChainIdService {
  constructor(private readonly config: AppConfigService) {}

  buildChainPropositionId(propositionId: string): string {
    return this.buildId("proposition", propositionId);
  }

  buildChainMarketId(marketId: string): string {
    return this.buildId("market", marketId);
  }

  private buildId(
    namespace: ValidationEntityNamespace,
    sourceId: string,
  ): string {
    const normalizedSourceId = sourceId.trim();
    if (normalizedSourceId.length === 0) {
      throw new Error(`Validation chain ${namespace} id source cannot be empty`);
    }

    const payload = [
      "arena",
      "validation",
      namespace,
      "v1",
      this.config.validationEnvironment,
      String(this.config.chainId),
      normalizedSourceId,
    ].join(":");

    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payload));
  }
}
