CREATE TYPE "RewardPayoutStatus" AS ENUM (
  'requested',
  'approved',
  'executing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE "RewardPayoutMethod" AS ENUM (
  'wallet_transfer'
);

CREATE TABLE "reward_payout" (
  "id" TEXT NOT NULL,
  "ledger_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "method" "RewardPayoutMethod" NOT NULL DEFAULT 'wallet_transfer',
  "status" "RewardPayoutStatus" NOT NULL DEFAULT 'requested',
  "asset_symbol" TEXT NOT NULL DEFAULT 'USDC',
  "chain_id" INTEGER NOT NULL,
  "amount" TEXT NOT NULL,
  "destination_address" TEXT NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "approved_by_user_id" TEXT,
  "execution_started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "execution_tx_hash" TEXT,
  "external_reference" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_payout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_reward_payout_ledger_id" ON "reward_payout"("ledger_id");
CREATE INDEX "idx_reward_payout_user_status_requested_at" ON "reward_payout"("user_id", "status", "requested_at");
CREATE INDEX "idx_reward_payout_status_requested_at" ON "reward_payout"("status", "requested_at");
CREATE INDEX "idx_reward_payout_approved_by_approved_at" ON "reward_payout"("approved_by_user_id", "approved_at");

ALTER TABLE "reward_payout"
  ADD CONSTRAINT "reward_payout_ledger_id_fkey"
  FOREIGN KEY ("ledger_id") REFERENCES "reward_ledger"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reward_payout"
  ADD CONSTRAINT "reward_payout_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reward_payout"
  ADD CONSTRAINT "reward_payout_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "arena_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "reward_payout" (
  "id",
  "ledger_id",
  "user_id",
  "method",
  "status",
  "asset_symbol",
  "chain_id",
  "amount",
  "destination_address",
  "requested_at",
  "approved_at",
  "approved_by_user_id",
  "execution_started_at",
  "completed_at",
  "created_at",
  "updated_at"
)
SELECT
  'reward_payout_' || "id",
  "id",
  "user_id",
  'wallet_transfer'::"RewardPayoutMethod",
  CASE
    WHEN "status" = 'finalized' THEN 'completed'::"RewardPayoutStatus"
    ELSE 'requested'::"RewardPayoutStatus"
  END,
  'USDC',
  1,
  COALESCE("final_amount", "pending_amount"),
  COALESCE(
    (SELECT "primary_wallet_address" FROM "arena_user" WHERE "arena_user"."id" = "reward_ledger"."user_id"),
    "user_id"
  ),
  COALESCE("finalized_at", "created_at"),
  CASE WHEN "status" = 'finalized' THEN "finalized_at" ELSE NULL END,
  NULL,
  CASE WHEN "status" = 'finalized' THEN "finalized_at" ELSE NULL END,
  CASE WHEN "status" = 'finalized' THEN "finalized_at" ELSE NULL END,
  "created_at",
  "updated_at"
FROM "reward_ledger"
WHERE "status" = 'finalized'
  AND COALESCE("final_amount", "pending_amount") IS NOT NULL;
