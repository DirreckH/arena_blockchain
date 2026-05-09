CREATE TYPE "ValidationChainMarketStatus" AS ENUM (
  'pre_live',
  'live',
  'frozen',
  'resolved',
  'cancelled'
);

CREATE TYPE "ValidationChainResultKind" AS ENUM (
  'resolved',
  'void'
);

CREATE TYPE "ValidationChainVoidReason" AS ENUM (
  'insufficient_sample',
  'tie'
);

CREATE TYPE "ValidationChainSyncStatus" AS ENUM (
  'idle',
  'syncing',
  'error',
  'paused'
);

ALTER TABLE "market"
ADD COLUMN "chain_market_id" TEXT,
ADD COLUMN "chain_proposition_id" TEXT,
ADD COLUMN "chain_status" "ValidationChainMarketStatus",
ADD COLUMN "chain_opened_at" TIMESTAMPTZ(3),
ADD COLUMN "chain_frozen_at" TIMESTAMPTZ(3),
ADD COLUMN "chain_resolved_at" TIMESTAMPTZ(3),
ADD COLUMN "chain_cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN "chain_result_kind" "ValidationChainResultKind",
ADD COLUMN "chain_winning_option" INTEGER,
ADD COLUMN "chain_void_reason" "ValidationChainVoidReason",
ADD COLUMN "resolution_tx_hash" TEXT,
ADD COLUMN "cancel_tx_hash" TEXT,
ADD COLUMN "chain_synced_at" TIMESTAMPTZ(3);

ALTER TABLE "bet"
ADD COLUMN "claimed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "claimed_at" TIMESTAMPTZ(3),
ADD COLUMN "claim_tx_hash" TEXT,
ADD COLUMN "refunded_at" TIMESTAMPTZ(3),
ADD COLUMN "refund_tx_hash" TEXT,
ADD COLUMN "chain_synced_at" TIMESTAMPTZ(3);

CREATE TABLE "validation_chain_event" (
  "id" TEXT NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "contract_address" TEXT NOT NULL,
  "block_number" INTEGER NOT NULL,
  "block_hash" TEXT NOT NULL,
  "transaction_hash" TEXT NOT NULL,
  "transaction_index" INTEGER NOT NULL,
  "log_index" INTEGER NOT NULL,
  "event_name" TEXT NOT NULL,
  "market_chain_id" TEXT,
  "proposition_chain_id" TEXT,
  "payload_json" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "validation_chain_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "validation_chain_cursor" (
  "stream_key" TEXT NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "contract_address" TEXT NOT NULL,
  "last_processed_block" INTEGER,
  "last_processed_tx_hash" TEXT,
  "last_processed_log_index" INTEGER,
  "last_finalized_block" INTEGER,
  "sync_status" "ValidationChainSyncStatus" NOT NULL DEFAULT 'idle',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "validation_chain_cursor_pkey" PRIMARY KEY ("stream_key")
);

CREATE UNIQUE INDEX "uq_market_chain_market_id"
ON "market"("chain_market_id");

CREATE INDEX "idx_market_chain_proposition_id"
ON "market"("chain_proposition_id");

CREATE INDEX "idx_market_chain_status"
ON "market"("chain_status");

CREATE UNIQUE INDEX "uq_validation_chain_event_chain_tx_log"
ON "validation_chain_event"("chain_id", "transaction_hash", "log_index");

CREATE INDEX "idx_validation_chain_event_stream_order"
ON "validation_chain_event"(
  "chain_id",
  "contract_address",
  "block_number",
  "transaction_index",
  "log_index"
);

CREATE INDEX "idx_validation_chain_event_market_chain_id"
ON "validation_chain_event"("market_chain_id");

CREATE INDEX "idx_validation_chain_event_proposition_chain_id"
ON "validation_chain_event"("proposition_chain_id");
