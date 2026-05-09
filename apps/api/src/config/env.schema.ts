import { z } from "zod";

const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const optionalPrivateKeySchema = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => value.length === 0 || /^0x[a-fA-F0-9]{64}$/.test(value),
    "Must be empty or a 32-byte hex private key prefixed with 0x",
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    AUTH_CHALLENGE_TTL: z.coerce.number().int().positive().default(300),
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
