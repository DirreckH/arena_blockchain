import { z } from "zod";

const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const parseCommaSeparatedEntries = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
const keyedStringMappingsSchema = (input: {
  separator: string;
  valueLabel: string;
  validateValue: (value: string) => boolean;
}) =>
  z
    .string()
    .optional()
    .default("")
    .refine((value) => {
      const entries = parseCommaSeparatedEntries(value);

      return entries.every((entry) => {
        const separatorIndex = entry.indexOf(input.separator);
        if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
          return false;
        }

        const key = entry.slice(0, separatorIndex).trim();
        const mappedValue = entry.slice(separatorIndex + 1).trim();
        return key.length > 0 && input.validateValue(mappedValue);
      });
    }, `Must be a comma-separated list of key${input.separator}${input.valueLabel} mappings`);
const optionalEthereumAddressSchema = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => value.length === 0 || /^0x[a-fA-F0-9]{40}$/.test(value),
    "Must be empty or an Ethereum address prefixed with 0x",
  );
const optionalPrivateKeySchema = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => value.length === 0 || /^0x[a-fA-F0-9]{64}$/.test(value),
    "Must be empty or a 32-byte hex private key prefixed with 0x",
  );
const webhookBearerTokenMappingsSchema = keyedStringMappingsSchema({
  separator: ":",
  valueLabel: "token webhook bearer",
  validateValue: (value) => value.length > 0,
});
const webhookTargetMappingsSchema = keyedStringMappingsSchema({
  separator: "=",
  valueLabel: "https://example.com/webhook",
  validateValue: (value) => z.string().url().safeParse(value).success,
});

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    ARENA_PROCESS_ROLE: z.enum(["api", "worker", "all"]).default("all"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    AUTH_CHALLENGE_TTL: z.coerce.number().int().positive().default(300),
    ARENA_RATE_LIMIT_AUTH_CHALLENGE_LIMIT: z.coerce.number().int().positive().default(5),
    ARENA_RATE_LIMIT_AUTH_CHALLENGE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    ARENA_RATE_LIMIT_AUTH_VERIFY_LIMIT: z.coerce.number().int().positive().default(10),
    ARENA_RATE_LIMIT_AUTH_VERIFY_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300),
    ARENA_RATE_LIMIT_ADJUDICATION_RESPONSE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(12),
    ARENA_RATE_LIMIT_ADJUDICATION_RESPONSE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    ARENA_RATE_LIMIT_VALIDATION_PREPARE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    ARENA_RATE_LIMIT_VALIDATION_PREPARE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    ARENA_RATE_LIMIT_VALIDATION_CONFIRM_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    ARENA_RATE_LIMIT_VALIDATION_CONFIRM_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    ARENA_RATE_LIMIT_INTERNAL_LIMIT: z.coerce.number().int().positive().default(120),
    ARENA_RATE_LIMIT_INTERNAL_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    RPC_URL: z.string().url(),
    CHAIN_ID: z.coerce.number().int().positive(),
    ARENA_CONTRACT_ADDRESS: ethereumAddressSchema,
    ARENA_VALIDATION_ENVIRONMENT: z.enum(["local", "dev", "staging", "prod"]),
    ARENA_VALIDATION_CONTRACT_ADDRESS: ethereumAddressSchema,
    ARENA_VALIDATION_SYNC_CONFIRMATIONS: z.coerce.number().int().min(1).default(12),
    ARENA_VALIDATION_SYNC_BATCH_SIZE: z.coerce.number().int().positive().default(500),
    ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
    ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: optionalPrivateKeySchema,
    ARENA_VALIDATION_ORACLE_PRIVATE_KEY: optionalPrivateKeySchema,
    ARENA_VALIDATION_PAUSER_PRIVATE_KEY: optionalPrivateKeySchema,
    ARENA_REWARD_PAYOUT_ASSET_SYMBOL: z.string().trim().min(1).default("USDC"),
    ARENA_REWARD_PAYOUT_ERC20_ADDRESS: optionalEthereumAddressSchema,
    ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY: optionalPrivateKeySchema,
    ARENA_REWARD_PAYOUT_CONFIRMATION_COUNT: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),
    ARENA_OPS_ALERT_WEBHOOK_TARGETS: webhookTargetMappingsSchema,
    ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS: webhookBearerTokenMappingsSchema,
    ARENA_OPS_ALERT_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS: webhookBearerTokenMappingsSchema,
    OPERATOR_WALLET_ADDRESSES: z.string().optional().default(""),
    ADMIN_WALLET_ADDRESSES: z.string().optional().default(""),
    SYSTEM_WALLET_ADDRESSES: z.string().optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.ARENA_CONTRACT_ADDRESS.toLowerCase() ===
      value.ARENA_VALIDATION_CONTRACT_ADDRESS.toLowerCase()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ARENA_VALIDATION_CONTRACT_ADDRESS"],
        message:
          "Validation contract address must be different from the legacy ARENA_CONTRACT_ADDRESS",
      });
    }
  });

export type EnvironmentVariables = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ")}`,
    );
  }

  return result.data;
}
