ALTER TYPE "RewardLedgerStatus" RENAME TO "RewardLedgerStatus_legacy";
CREATE TYPE "RewardLedgerStatus" AS ENUM ('pending', 'finalized', 'voided', 'reversed');

ALTER TYPE "RewardLedgerCancelReason" RENAME TO "RewardLedgerReasonCode_legacy";
CREATE TYPE "RewardLedgerReasonCode" AS ENUM (
  'review_valid',
  'review_partial_valid',
  'invalid_review',
  'review_corrected',
  'superseded_pending_latest',
  'late_submit',
  'expired_task_submit',
  'revealing_started_submit',
  'fraud_suspected_review'
);

ALTER TABLE "reward_ledger"
  ADD COLUMN "ledger_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "review_status" "ResponseReviewStatus",
  ADD COLUMN "voided_at" TIMESTAMPTZ(3),
  ADD COLUMN "reversal_of_ledger_id" TEXT,
  ADD COLUMN "reason_code" "RewardLedgerReasonCode",
  ADD COLUMN "status_new" "RewardLedgerStatus";

UPDATE "reward_ledger"
SET
  "review_status" = CASE
    WHEN "status"::text = 'pending_review' THEN 'pending_review'::"ResponseReviewStatus"
    WHEN "cancel_reason"::text = 'invalid_review' THEN 'invalid'::"ResponseReviewStatus"
    WHEN "cancel_reason"::text = 'fraud_suspected_review' THEN 'fraud_suspected'::"ResponseReviewStatus"
    WHEN "status"::text IN ('pending_payout', 'paid') AND "final_amount" IS NOT NULL AND "final_amount" <> "pending_amount"
      THEN 'partial_valid'::"ResponseReviewStatus"
    WHEN "status"::text IN ('pending_payout', 'paid')
      THEN 'valid'::"ResponseReviewStatus"
    ELSE NULL
  END,
  "reason_code" = CASE
    WHEN "reversed_at" IS NOT NULL THEN 'review_corrected'::"RewardLedgerReasonCode"
    WHEN "cancel_reason" IS NOT NULL THEN "cancel_reason"::text::"RewardLedgerReasonCode"
    WHEN "status"::text IN ('pending_payout', 'paid') AND "final_amount" IS NOT NULL AND "final_amount" <> "pending_amount"
      THEN 'review_partial_valid'::"RewardLedgerReasonCode"
    WHEN "status"::text IN ('pending_payout', 'paid')
      THEN 'review_valid'::"RewardLedgerReasonCode"
    ELSE NULL
  END,
  "voided_at" = CASE
    WHEN "status"::text = 'cancelled' AND "reversed_at" IS NULL
      THEN COALESCE("finalized_at", "updated_at", "created_at")
    ELSE NULL
  END,
  "status_new" = CASE
    WHEN "status"::text = 'pending_review' THEN 'pending'::"RewardLedgerStatus"
    WHEN "status"::text IN ('pending_payout', 'paid') THEN 'finalized'::"RewardLedgerStatus"
    WHEN "status"::text = 'cancelled' AND "reversed_at" IS NOT NULL THEN 'reversed'::"RewardLedgerStatus"
    ELSE 'voided'::"RewardLedgerStatus"
  END;

ALTER TABLE "reward_ledger"
  ALTER COLUMN "status_new" SET NOT NULL;

DROP INDEX "uq_reward_ledger_proposition_user_source_type";
DROP INDEX "idx_reward_ledger_status_paid_at";

ALTER TABLE "reward_ledger"
  DROP COLUMN "status",
  DROP COLUMN "paid_at",
  DROP COLUMN "cancel_reason";

ALTER TABLE "reward_ledger"
  RENAME COLUMN "status_new" TO "status";

ALTER TABLE "reward_ledger"
  ALTER COLUMN "status" SET DEFAULT 'pending';

CREATE UNIQUE INDEX "uq_reward_ledger_response_version"
ON "reward_ledger"("response_id", "ledger_version");

CREATE INDEX "idx_reward_ledger_proposition_user_source"
ON "reward_ledger"("proposition_id", "user_id", "source_type", "created_at");

CREATE INDEX "idx_reward_ledger_user_status"
ON "reward_ledger"("user_id", "status");

DROP TYPE "RewardLedgerStatus_legacy";
DROP TYPE "RewardLedgerReasonCode_legacy";
