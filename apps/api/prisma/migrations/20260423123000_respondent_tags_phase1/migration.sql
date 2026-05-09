CREATE TYPE "PropositionCategory" AS ENUM (
  'general',
  'sports',
  'ai',
  'brand_research',
  'politics',
  'entertainment'
);

CREATE TYPE "UserTagType" AS ENUM (
  'quality_reputation',
  'interest'
);

CREATE TYPE "UserTagSourceType" AS ENUM (
  'reputation',
  'participation'
);

ALTER TABLE "proposition"
ADD COLUMN "category" "PropositionCategory" NOT NULL DEFAULT 'general';

CREATE TABLE "user_tag" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tag_key" TEXT NOT NULL,
  "tag_type" "UserTagType" NOT NULL,
  "tag_value" TEXT NOT NULL,
  "confidence_score" INTEGER NOT NULL,
  "source_type" "UserTagSourceType" NOT NULL,
  "rule_version" TEXT NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "activated_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_tag_user_key"
ON "user_tag"("user_id", "tag_key");

CREATE INDEX "idx_user_tag_user_type_expires_at"
ON "user_tag"("user_id", "tag_type", "expires_at");
