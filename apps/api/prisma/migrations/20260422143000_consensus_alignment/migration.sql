ALTER TABLE "proposition"
ADD COLUMN "reveal_started_at" TIMESTAMPTZ(3),
ADD COLUMN "result_computed_at" TIMESTAMPTZ(3);

ALTER TABLE "reward_ledger"
RENAME COLUMN "approved_at" TO "finalized_at";
