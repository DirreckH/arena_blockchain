import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SystemRole, expandSystemRoles } from "@arena/shared";

import type {
  ArenaRateLimitBucket,
  ArenaResolvedRateLimitPolicy,
} from "../common/decorators/arena-rate-limit.decorator";
import type { EnvironmentVariables } from "./env.schema";

@Injectable()
export class AppConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  get nodeEnv(): EnvironmentVariables["NODE_ENV"] {
    return this.configService.get("NODE_ENV", { infer: true });
  }

  get processRole(): EnvironmentVariables["ARENA_PROCESS_ROLE"] {
    return this.configService.get("ARENA_PROCESS_ROLE", { infer: true });
  }

  get isApiProcess(): boolean {
    return this.processRole === "api" || this.processRole === "all";
  }

  get isWorkerProcess(): boolean {
    return this.processRole === "worker" || this.processRole === "all";
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

  get rewardPayoutAssetSymbol(): string {
    return this.configService.get("ARENA_REWARD_PAYOUT_ASSET_SYMBOL", {
      infer: true,
    });
  }

  get rewardPayoutErc20Address(): string {
    return this.configService.get("ARENA_REWARD_PAYOUT_ERC20_ADDRESS", {
      infer: true,
    });
  }

  get rewardPayoutOperatorPrivateKey(): string {
    return this.configService.get(
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
      {
        infer: true,
      },
    );
  }

  get rewardPayoutConfirmationCount(): number {
    return this.configService.get(
      "ARENA_REWARD_PAYOUT_CONFIRMATION_COUNT",
      {
        infer: true,
      },
    );
  }

  get opsAlertWebhookTargets(): Record<string, string> {
    return this.parseKeyedMappings("ARENA_OPS_ALERT_WEBHOOK_TARGETS", "=");
  }

  get opsAlertWebhookBearerTokens(): Record<string, string> {
    return this.parseKeyedMappings("ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS", ":");
  }

  get opsAlertWebhookTimeoutMs(): number {
    return (
      this.configService.get("ARENA_OPS_ALERT_WEBHOOK_TIMEOUT_MS", {
        infer: true,
      }) ?? 5000
    );
  }

  resolveArenaRateLimit(
    bucket: ArenaRateLimitBucket,
  ): ArenaResolvedRateLimitPolicy {
    switch (bucket) {
      case "auth_challenge":
        return {
          bucket,
          keyStrategy: "client",
          limit: this.configService.get("ARENA_RATE_LIMIT_AUTH_CHALLENGE_LIMIT", {
            infer: true,
          }),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_AUTH_CHALLENGE_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
      case "auth_verify":
        return {
          bucket,
          keyStrategy: "client",
          limit: this.configService.get("ARENA_RATE_LIMIT_AUTH_VERIFY_LIMIT", {
            infer: true,
          }),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_AUTH_VERIFY_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
      case "adjudication_response_submit":
        return {
          bucket,
          keyStrategy: "user",
          limit: this.configService.get(
            "ARENA_RATE_LIMIT_ADJUDICATION_RESPONSE_LIMIT",
            {
              infer: true,
            },
          ),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_ADJUDICATION_RESPONSE_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
      case "validation_bet_prepare":
        return {
          bucket,
          keyStrategy: "user",
          limit: this.configService.get(
            "ARENA_RATE_LIMIT_VALIDATION_PREPARE_LIMIT",
            {
              infer: true,
            },
          ),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_VALIDATION_PREPARE_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
      case "validation_bet_confirm":
        return {
          bucket,
          keyStrategy: "user",
          limit: this.configService.get(
            "ARENA_RATE_LIMIT_VALIDATION_CONFIRM_LIMIT",
            {
              infer: true,
            },
          ),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_VALIDATION_CONFIRM_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
      case "internal":
        return {
          bucket,
          keyStrategy: "user",
          limit: this.configService.get("ARENA_RATE_LIMIT_INTERNAL_LIMIT", {
            infer: true,
          }),
          windowSeconds: this.configService.get(
            "ARENA_RATE_LIMIT_INTERNAL_WINDOW_SECONDS",
            {
              infer: true,
            },
          ),
        };
    }
  }

  get requesterDeliveryWebhookBearerTokens(): Record<string, string> {
    return this.parseKeyedMappings(
      "REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS",
      ":",
    );
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

  private parseKeyedMappings<
    TKey extends keyof Pick<
      EnvironmentVariables,
      | "ARENA_OPS_ALERT_WEBHOOK_TARGETS"
      | "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS"
      | "REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS"
    >,
  >(key: TKey, separator: ":" | "="): Record<string, string> {
    const rawValue = this.configService.get(key, { infer: true }) ?? "";

    return rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .reduce<Record<string, string>>((tokens, entry) => {
        const separatorIndex = entry.indexOf(separator);
        if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
          return tokens;
        }

        const mappingKey = entry.slice(0, separatorIndex).trim();
        const value = entry.slice(separatorIndex + 1).trim();
        if (mappingKey.length === 0 || value.length === 0) {
          return tokens;
        }

        tokens[mappingKey] = value;
        return tokens;
      }, {});
  }
}
