import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SystemRole, expandSystemRoles } from "@arena/shared";

import type { EnvironmentVariables } from "./env.schema";

@Injectable()
export class AppConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  get nodeEnv(): EnvironmentVariables["NODE_ENV"] {
    return this.configService.get("NODE_ENV", { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === "development";
  }

  get port(): number {
    return this.configService.get("PORT", { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get("DATABASE_URL", { infer: true });
  }

  get redisUrl(): string {
    return this.configService.get("REDIS_URL", { infer: true });
  }

  get jwtSecret(): string {
    return this.configService.get("JWT_SECRET", { infer: true });
  }

  get authChallengeTtlSeconds(): number {
    return this.configService.get("AUTH_CHALLENGE_TTL", { infer: true });
  }

  get rpcUrl(): string {
    return this.configService.get("RPC_URL", { infer: true });
  }

  get chainId(): number {
    return this.configService.get("CHAIN_ID", { infer: true });
  }

  get arenaContractAddress(): string {
    return this.configService.get("ARENA_CONTRACT_ADDRESS", { infer: true });
  }

  get validationEnvironment(): EnvironmentVariables["ARENA_VALIDATION_ENVIRONMENT"] {
    return this.configService.get("ARENA_VALIDATION_ENVIRONMENT", {
      infer: true,
    });
  }

  get validationContractAddress(): string {
    return this.configService.get("ARENA_VALIDATION_CONTRACT_ADDRESS", {
      infer: true,
    });
  }

  get validationSyncConfirmations(): number {
    return this.configService.get("ARENA_VALIDATION_SYNC_CONFIRMATIONS", {
      infer: true,
    });
  }

  get validationSyncBatchSize(): number {
    return this.configService.get("ARENA_VALIDATION_SYNC_BATCH_SIZE", {
      infer: true,
    });
  }

  get validationSyncPollIntervalMs(): number {
    return this.configService.get("ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS", {
      infer: true,
    });
  }

  get validationOperatorPrivateKey(): string {
    return this.configService.get("ARENA_VALIDATION_OPERATOR_PRIVATE_KEY", {
      infer: true,
    });
  }

  get validationOraclePrivateKey(): string {
    return this.configService.get("ARENA_VALIDATION_ORACLE_PRIVATE_KEY", {
      infer: true,
    });
  }

  get validationPauserPrivateKey(): string {
    return this.configService.get("ARENA_VALIDATION_PAUSER_PRIVATE_KEY", {
      infer: true,
    });
  }

  get operatorWalletAddresses(): string[] {
    return this.parseWalletList("OPERATOR_WALLET_ADDRESSES");
  }

  get adminWalletAddresses(): string[] {
    return this.parseWalletList("ADMIN_WALLET_ADDRESSES");
  }

  get systemWalletAddresses(): string[] {
    return this.parseWalletList("SYSTEM_WALLET_ADDRESSES");
  }

  resolveRolesForWallet(walletAddress: string): SystemRole[] {
    const normalizedWalletAddress = walletAddress.toLowerCase();

    if (this.systemWalletAddresses.includes(normalizedWalletAddress)) {
      return expandSystemRoles([SystemRole.System]);
    }

    if (this.adminWalletAddresses.includes(normalizedWalletAddress)) {
      return expandSystemRoles([SystemRole.Admin]);
    }

    if (this.operatorWalletAddresses.includes(normalizedWalletAddress)) {
      return expandSystemRoles([SystemRole.Operator]);
    }

    return expandSystemRoles([SystemRole.User]);
  }

  private parseWalletList(key: keyof Pick<
    EnvironmentVariables,
    | "OPERATOR_WALLET_ADDRESSES"
    | "ADMIN_WALLET_ADDRESSES"
    | "SYSTEM_WALLET_ADDRESSES"
  >): string[] {
    const rawValue = this.configService.get(key, { infer: true });

    return rawValue
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
  }
}
