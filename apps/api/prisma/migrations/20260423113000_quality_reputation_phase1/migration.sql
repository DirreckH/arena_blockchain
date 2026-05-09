CREATE TYPE "ReputationLevel" AS ENUM ('new', 'normal', 'trusted', 'risky');

CREATE TABLE "user_reputation" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reputation_score" INTEGER NOT NULL,
  "reputation_level" "ReputationLevel" NOT NULL,
  "rule_version" TEXT NOT NULL,
  "metrics_json" JSONB NOT NULL,
  "computed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_reputation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_reputation_user_id"
ON "user_reputation"("user_id");

CREATE INDEX "idx_user_reputation_level_computed_at"
ON "user_reputation"("reputation_level", "computed_at");
