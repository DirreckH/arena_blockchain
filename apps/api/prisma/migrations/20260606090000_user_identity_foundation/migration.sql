CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked', 'deleted');

CREATE TABLE "arena_user" (
  "id" TEXT NOT NULL,
  "primary_wallet_address" TEXT,
  "normalized_primary_wallet_address" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "last_login_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "arena_user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_wallet" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "normalized_wallet_address" TEXT NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_session" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "access_token" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_normalized_primary_wallet_address"
ON "arena_user"("normalized_primary_wallet_address");

CREATE INDEX "idx_user_status_created_at"
ON "arena_user"("status", "created_at");

CREATE UNIQUE INDEX "uq_user_wallet_normalized_wallet_chain"
ON "user_wallet"("normalized_wallet_address", "chain_id");

CREATE INDEX "idx_user_wallet_user_primary"
ON "user_wallet"("user_id", "is_primary");

CREATE INDEX "idx_user_session_user_issued_at"
ON "user_session"("user_id", "issued_at");

CREATE INDEX "idx_user_session_expires_revoked"
ON "user_session"("expires_at", "revoked_at");

ALTER TABLE "user_wallet"
ADD CONSTRAINT "user_wallet_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_session"
ADD CONSTRAINT "user_session_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "arena_user" (
  "id",
  "primary_wallet_address",
  "normalized_primary_wallet_address",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  "source"."user_id",
  NULL,
  NULL,
  'active'::"UserStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "user_id" FROM "reward_ledger"
  UNION
  SELECT DISTINCT "user_id" FROM "user_reputation"
  UNION
  SELECT DISTINCT "user_id" FROM "user_tag"
  UNION
  SELECT DISTINCT "user_id" FROM "dispatch_task"
  UNION
  SELECT DISTINCT "user_id" FROM "response"
  UNION
  SELECT DISTINCT "user_id" FROM "bet"
  UNION
  SELECT DISTINCT "created_by_user_id" AS "user_id" FROM "proposition"
  UNION
  SELECT DISTINCT "updated_by_user_id" AS "user_id" FROM "proposition"
  UNION
  SELECT DISTINCT "reviewed_by_user_id" AS "user_id" FROM "response_review"
  UNION
  SELECT DISTINCT "actor_user_id" AS "user_id" FROM "internal_audit_event"
) AS "source"
LEFT JOIN "arena_user" AS "existing"
  ON "existing"."id" = "source"."user_id"
WHERE "source"."user_id" IS NOT NULL
  AND "existing"."id" IS NULL;

ALTER TABLE "proposition"
ADD CONSTRAINT "proposition_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "proposition"
ADD CONSTRAINT "proposition_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispatch_task"
ADD CONSTRAINT "dispatch_task_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "response"
ADD CONSTRAINT "response_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "response_review"
ADD CONSTRAINT "response_review_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bet"
ADD CONSTRAINT "bet_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reward_ledger"
ADD CONSTRAINT "reward_ledger_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_reputation"
ADD CONSTRAINT "user_reputation_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_tag"
ADD CONSTRAINT "user_tag_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_audit_event"
ADD CONSTRAINT "internal_audit_event_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "arena_user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
