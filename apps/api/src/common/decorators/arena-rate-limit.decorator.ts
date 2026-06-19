import { SetMetadata } from "@nestjs/common";

export type ArenaRateLimitBucket =
  | "auth_challenge"
  | "auth_verify"
  | "adjudication_response_submit"
  | "validation_bet_prepare"
  | "validation_bet_confirm"
  | "internal";

export type ArenaRateLimitKeyStrategy = "client" | "user";

export type ArenaRateLimitPolicy = {
  bucket: ArenaRateLimitBucket;
  keyStrategy?: ArenaRateLimitKeyStrategy;
};

export type ArenaResolvedRateLimitPolicy = ArenaRateLimitPolicy & {
  limit: number;
  windowSeconds: number;
};

export const ARENA_RATE_LIMIT_KEY = "arenaRateLimit";

export const ArenaRateLimit = (
  policy: ArenaRateLimitPolicy | ArenaRateLimitBucket,
) =>
  SetMetadata(
    ARENA_RATE_LIMIT_KEY,
    typeof policy === "string" ? { bucket: policy } : policy,
  );
