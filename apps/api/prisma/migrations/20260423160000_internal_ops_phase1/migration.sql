CREATE TABLE "internal_audit_event" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_internal_audit_entity_created_at"
ON "internal_audit_event"("entity_type", "entity_id", "created_at");

CREATE INDEX "idx_internal_audit_action_created_at"
ON "internal_audit_event"("action", "created_at");
