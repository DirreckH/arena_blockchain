-- CreateEnum
CREATE TYPE "PropositionType" AS ENUM ('consensus');

-- CreateEnum
CREATE TYPE "PropositionStructure" AS ENUM ('binary');

-- CreateEnum
CREATE TYPE "RollingMode" AS ENUM ('non_rolling', 'rolling');

-- CreateEnum
CREATE TYPE "SettlementTarget" AS ENUM ('final');

-- CreateEnum
CREATE TYPE "PropositionStatus" AS ENUM (
    'draft',
    'scheduled',
    'live',
    'revealing',
    'settled',
    'closed',
    'archived'
);

-- CreateEnum
CREATE TYPE "PropositionResultKind" AS ENUM ('resolved', 'void');

-- CreateEnum
CREATE TYPE "PropositionVoidReason" AS ENUM ('insufficient_sample', 'tie');

-- CreateEnum
CREATE TYPE "DispatchTaskStatus" AS ENUM (
    'assigned',
    'started',
    'submitted',
    'skipped',
    'expired'
);

-- CreateEnum
CREATE TYPE "ResponseReviewStatus" AS ENUM (
    'pending_review',
    'valid',
    'partial_valid',
    'invalid',
    'fraud_suspected'
);

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM (
    'pre_live',
    'live',
    'frozen_for_reveal',
    'settling',
    'settled'
);

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('placed', 'settled', 'cancelled');

-- CreateEnum
CREATE TYPE "BetSettlementOutcome" AS ENUM ('won', 'lost', 'refund');

-- CreateEnum
CREATE TYPE "RewardLedgerSourceType" AS ENUM ('response');

-- CreateEnum
CREATE TYPE "RewardLedgerStatus" AS ENUM (
    'pending_review',
    'pending_payout',
    'paid',
    'cancelled'
);

-- CreateEnum
CREATE TYPE "RewardLedgerCancelReason" AS ENUM (
    'invalid_review',
    'superseded_pending_latest',
    'late_submit',
    'expired_task_submit',
    'revealing_started_submit',
    'fraud_suspected_review'
);

-- CreateTable
CREATE TABLE "proposition" (
    "id" TEXT NOT NULL,
    "chain_pk_id" BIGINT,
    "type" "PropositionType" NOT NULL DEFAULT 'consensus',
    "structure" "PropositionStructure" NOT NULL DEFAULT 'binary',
    "rolling_mode" "RollingMode" NOT NULL DEFAULT 'non_rolling',
    "market_enabled" BOOLEAN NOT NULL DEFAULT true,
    "settlement_target" "SettlementTarget" NOT NULL DEFAULT 'final',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "options" TEXT[],
    "sample_constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_effective_sample" INTEGER NOT NULL,
    "min_bet_amount" TEXT NOT NULL,
    "min_duration_seconds" INTEGER NOT NULL,
    "max_duration_seconds" INTEGER NOT NULL,
    "reward_budget" TEXT NOT NULL,
    "base_response_reward" TEXT NOT NULL,
    "status" "PropositionStatus" NOT NULL DEFAULT 'draft',
    "result_kind" "PropositionResultKind",
    "winning_option" INTEGER,
    "void_reason" "PropositionVoidReason",
    "published_at" TIMESTAMPTZ(3),
    "live_at" TIMESTAMPTZ(3),
    "frozen_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_task" (
    "id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "DispatchTaskStatus" NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "skip_reason" TEXT,
    "expiry_reason" TEXT,
    "cooldown_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dispatch_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response" (
    "id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "response_payload" JSONB NOT NULL,
    "response_version" INTEGER NOT NULL DEFAULT 1,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "selected_option" INTEGER NOT NULL,
    "confirmation_option" INTEGER NOT NULL,
    "client_started_at" TIMESTAMPTZ(3) NOT NULL,
    "client_submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "understanding_ack" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_review" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "status" "ResponseReviewStatus" NOT NULL DEFAULT 'pending_review',
    "quality_score" INTEGER NOT NULL DEFAULT 0,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "response_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "effective_sample_counter" (
    "id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "partial_valid_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "total_reviewed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "effective_sample_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "settlement_target" "SettlementTarget" NOT NULL DEFAULT 'final',
    "status" "MarketStatus" NOT NULL DEFAULT 'pre_live',
    "current_public_progress" JSONB,
    "last_public_result" JSONB,
    "live_at" TIMESTAMPTZ(3),
    "frozen_at" TIMESTAMPTZ(3),
    "settling_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "selected_option" INTEGER NOT NULL,
    "stake_amount" TEXT NOT NULL,
    "status" "BetStatus" NOT NULL DEFAULT 'placed',
    "placed_at" TIMESTAMPTZ(3) NOT NULL,
    "settled_at" TIMESTAMPTZ(3),
    "settlement_outcome" "BetSettlementOutcome",
    "gross_payout" TEXT,
    "pnl" TEXT,
    "refund_amount" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_ledger" (
    "id" TEXT NOT NULL,
    "proposition_id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" "RewardLedgerSourceType" NOT NULL DEFAULT 'response',
    "source_id" TEXT NOT NULL,
    "pending_amount" TEXT NOT NULL,
    "final_amount" TEXT,
    "status" "RewardLedgerStatus" NOT NULL DEFAULT 'pending_review',
    "approved_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "reversed_at" TIMESTAMPTZ(3),
    "cancel_reason" "RewardLedgerCancelReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reward_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_proposition_chain_pk_id" ON "proposition"("chain_pk_id");

-- CreateIndex
CREATE INDEX "idx_proposition_status_published_at" ON "proposition"("status", "published_at");

-- CreateIndex
CREATE INDEX "idx_proposition_status_live_at" ON "proposition"("status", "live_at");

-- CreateIndex
CREATE INDEX "idx_dispatch_task_proposition_user_status" ON "dispatch_task"("proposition_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "idx_dispatch_task_user_status_expires_at" ON "dispatch_task"("user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_dispatch_task_status_expires_at" ON "dispatch_task"("status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_response_proposition_user_is_latest" ON "response"("proposition_id", "user_id", "is_latest");

-- CreateIndex
CREATE INDEX "idx_response_task_submitted_at" ON "response"("task_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_response_task_version" ON "response"("task_id", "response_version");

-- CreateIndex
CREATE UNIQUE INDEX "uq_response_review_response_id" ON "response_review"("response_id");

-- CreateIndex
CREATE INDEX "idx_response_review_status_reviewed_at" ON "response_review"("status", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_effective_sample_counter_proposition_id" ON "effective_sample_counter"("proposition_id");

-- CreateIndex
CREATE INDEX "idx_effective_sample_counter_updated_at" ON "effective_sample_counter"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_market_proposition_id" ON "market"("proposition_id");

-- CreateIndex
CREATE INDEX "idx_market_status_live_at" ON "market"("status", "live_at");

-- CreateIndex
CREATE INDEX "idx_market_status_settled_at" ON "market"("status", "settled_at");

-- CreateIndex
CREATE INDEX "idx_bet_proposition_user" ON "bet"("proposition_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_bet_status_placed_at" ON "bet"("status", "placed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bet_market_user" ON "bet"("market_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_reward_ledger_user_status" ON "reward_ledger"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_reward_ledger_status_paid_at" ON "reward_ledger"("status", "paid_at");

-- CreateIndex
CREATE INDEX "idx_reward_ledger_user_source" ON "reward_ledger"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reward_ledger_proposition_user_source_type"
ON "reward_ledger"("proposition_id", "user_id", "source_type");

-- AddForeignKey
ALTER TABLE "dispatch_task"
ADD CONSTRAINT "dispatch_task_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response"
ADD CONSTRAINT "response_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response"
ADD CONSTRAINT "response_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "dispatch_task"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_review"
ADD CONSTRAINT "response_review_response_id_fkey"
FOREIGN KEY ("response_id") REFERENCES "response"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effective_sample_counter"
ADD CONSTRAINT "effective_sample_counter_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market"
ADD CONSTRAINT "market_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet"
ADD CONSTRAINT "bet_market_id_fkey"
FOREIGN KEY ("market_id") REFERENCES "market"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet"
ADD CONSTRAINT "bet_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger"
ADD CONSTRAINT "reward_ledger_proposition_id_fkey"
FOREIGN KEY ("proposition_id") REFERENCES "proposition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger"
ADD CONSTRAINT "reward_ledger_response_id_fkey"
FOREIGN KEY ("response_id") REFERENCES "response"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma schema cannot express partial unique indexes.
-- MVP invariant: one active dispatch task per proposition/user pair.
CREATE UNIQUE INDEX "uq_dispatch_task_active_proposition_user"
ON "dispatch_task"("proposition_id", "user_id")
WHERE "status" IN (
    'assigned'::"DispatchTaskStatus",
    'started'::"DispatchTaskStatus"
);

-- MVP invariant: one latest response per proposition/user pair.
CREATE UNIQUE INDEX "uq_response_latest_proposition_user"
ON "response"("proposition_id", "user_id")
WHERE "is_latest" = true;
