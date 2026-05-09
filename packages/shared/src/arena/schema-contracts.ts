import type { ArenaCoreEntityName } from "./enums.js";

export interface SchemaFieldContract {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
}

export interface SchemaRelationContract {
  kind: "one-to-one" | "one-to-many" | "many-to-one";
  field: string;
  targetEntity: ArenaCoreEntityName;
  targetField: string;
  description: string;
}

export interface SchemaConstraintContract {
  kind: "primary" | "unique" | "index";
  fields: readonly string[];
  description: string;
}

export interface SchemaBusinessRuleContract {
  rule: string;
  description: string;
}

export interface SchemaModelContract {
  entity: ArenaCoreEntityName;
  tableName: string;
  fields: readonly SchemaFieldContract[];
  relations: readonly SchemaRelationContract[];
  constraints: readonly SchemaConstraintContract[];
  businessRules: readonly SchemaBusinessRuleContract[];
}

export const ARENA_SCHEMA_CONTRACT_POLICY = {
  definesMigrations: false,
  definesPersistenceStructureOnly: true,
  usesStringPrimaryIds: true,
  usesStringMoneyFields: true,
  usesIsoDatetimeStrings: true,
  keepsChainBridgeFieldsOptional: true,
} as const;

export const USER_REFERENCE_BOUNDARY = {
  owner: "platform_outer_layer",
  referenceStyle: "foreign_key_string_only",
  managedInsideArenaContracts: false,
} as const;

export const PROPOSITION_SCHEMA: SchemaModelContract = {
  entity: "Proposition",
  tableName: "proposition",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal primary key." },
    { name: "chain_pk_id", type: "number", nullable: true, description: "Optional bridge to Arena.sol pkId." },
    { name: "type", type: "string", nullable: false, description: "Locked to consensus." },
    { name: "structure", type: "string", nullable: false, description: "Locked to binary." },
    { name: "rolling_mode", type: "string", nullable: false, description: "Locked to non_rolling." },
    { name: "market_enabled", type: "boolean", nullable: false, description: "Whether validation layer exists." },
    { name: "settlement_target", type: "string", nullable: false, description: "Locked to final." },
    { name: "category", type: "string", nullable: false, description: "Stable proposition category used for respondent interest tagging." },
    { name: "title", type: "string", nullable: false, description: "Question title." },
    { name: "description", type: "string", nullable: false, description: "Question description." },
    { name: "options", type: "string[2]", nullable: false, description: "Binary option labels." },
    { name: "sample_constraints", type: "string[]", nullable: false, description: "Eligibility constraints snapshot." },
    { name: "min_effective_sample", type: "number", nullable: false, description: "Reveal gate sample minimum." },
    { name: "min_bet_amount", type: "string", nullable: false, description: "Minimum validation-layer stake amount in base units." },
    { name: "min_duration_seconds", type: "number", nullable: false, description: "Minimum live duration." },
    { name: "max_duration_seconds", type: "number", nullable: false, description: "Maximum live duration." },
    { name: "reward_budget", type: "string", nullable: false, description: "Fixed budget for response rewards." },
    { name: "base_response_reward", type: "string", nullable: false, description: "Fixed unit reward amount." },
    { name: "status", type: "string", nullable: false, description: "Lifecycle status." },
    { name: "result_kind", type: "string", nullable: true, description: "Resolved or void." },
    { name: "winning_option", type: "number", nullable: true, description: "Winning binary option." },
    { name: "void_reason", type: "string", nullable: true, description: "Void reason if unresolved." },
    { name: "published_at", type: "datetime", nullable: true, description: "Scheduled go-live time." },
    { name: "live_at", type: "datetime", nullable: true, description: "Actual live transition time." },
    { name: "frozen_at", type: "datetime", nullable: true, description: "Intake freeze time." },
    { name: "reveal_started_at", type: "datetime", nullable: true, description: "Reveal drain start time." },
    { name: "result_computed_at", type: "datetime", nullable: true, description: "Official result computation time." },
    { name: "settled_at", type: "datetime", nullable: true, description: "Final settlement time." },
    { name: "closed_at", type: "datetime", nullable: true, description: "Closed time." },
    { name: "archived_at", type: "datetime", nullable: true, description: "Archived time." },
    { name: "created_by_user_id", type: "string", nullable: false, description: "Outer user reference." },
    { name: "created_at", type: "datetime", nullable: false, description: "Creation timestamp." },
    { name: "updated_at", type: "datetime", nullable: false, description: "Last update timestamp." },
  ],
  relations: [
    { kind: "one-to-many", field: "dispatch_tasks", targetEntity: "DispatchTask", targetField: "proposition_id", description: "Assigned tasks under the proposition." },
    { kind: "one-to-many", field: "responses", targetEntity: "Response", targetField: "proposition_id", description: "Submitted responses." },
    { kind: "one-to-one", field: "effective_sample_counter", targetEntity: "EffectiveSampleCounter", targetField: "proposition_id", description: "Single counter record." },
    { kind: "one-to-one", field: "market", targetEntity: "Market", targetField: "proposition_id", description: "Single validation market." },
    { kind: "one-to-many", field: "reward_ledgers", targetEntity: "RewardLedger", targetField: "proposition_id", description: "Response reward ledgers." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal proposition primary key." },
    { kind: "unique", fields: ["chain_pk_id"], description: "Optional unique chain bridge." },
    { kind: "index", fields: ["status", "published_at"], description: "Lifecycle scheduling lookup." },
  ],
  businessRules: [
    { rule: "one_market_per_proposition", description: "Each proposition owns exactly one market." },
    { rule: "one_counter_per_proposition", description: "Each proposition owns exactly one effective sample counter." },
    { rule: "mvp_binary_non_rolling_single_question_only", description: "Current runtime only activates binary, non_rolling, single-question consensus propositions." },
  ],
};

export const DISPATCH_TASK_SCHEMA: SchemaModelContract = {
  entity: "DispatchTask",
  tableName: "dispatch_task",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal task primary key." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "user_id", type: "string", nullable: false, description: "Assigned outer user." },
    { name: "status", type: "string", nullable: false, description: "Dispatch task status." },
    { name: "assigned_at", type: "datetime", nullable: false, description: "Assignment timestamp." },
    { name: "started_at", type: "datetime", nullable: true, description: "Task start timestamp." },
    { name: "submitted_at", type: "datetime", nullable: true, description: "First submit timestamp." },
    { name: "expires_at", type: "datetime", nullable: false, description: "Task expiry timestamp." },
    { name: "skip_reason", type: "string", nullable: true, description: "User skip reason." },
    { name: "expiry_reason", type: "string", nullable: true, description: "System expiry reason." },
    { name: "cooldown_until", type: "datetime", nullable: true, description: "User cooldown deadline." },
  ],
  relations: [
    { kind: "many-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "Belongs to one proposition." },
    { kind: "one-to-many", field: "responses", targetEntity: "Response", targetField: "task_id", description: "Versioned responses under the task." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal dispatch primary key." },
    { kind: "index", fields: ["proposition_id", "user_id"], description: "Lookup by proposition and user." },
    { kind: "index", fields: ["status", "expires_at"], description: "Expiry and backlog worker lookup." },
  ],
  businessRules: [
    { rule: "single_active_task_per_proposition_user", description: "A proposition and user pair may not have multiple active tasks at once." },
  ],
};

export const RESPONSE_SCHEMA: SchemaModelContract = {
  entity: "Response",
  tableName: "response",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal response primary key." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "task_id", type: "string", nullable: false, description: "Owning dispatch task." },
    { name: "user_id", type: "string", nullable: false, description: "Submitting outer user." },
    { name: "response_version", type: "number", nullable: false, description: "Monotonic version per task." },
    { name: "is_latest", type: "boolean", nullable: false, description: "Latest-wins marker." },
    { name: "selected_option", type: "number", nullable: false, description: "Binary selected option." },
    { name: "confirmation_option", type: "number", nullable: false, description: "Attention confirmation value." },
    { name: "client_started_at", type: "datetime", nullable: false, description: "Client-side start timestamp." },
    { name: "client_submitted_at", type: "datetime", nullable: false, description: "Client-side submit timestamp." },
    { name: "understanding_ack", type: "boolean", nullable: false, description: "Understanding acknowledgement flag." },
    { name: "submitted_at", type: "datetime", nullable: false, description: "Server-side submit timestamp." },
  ],
  relations: [
    { kind: "many-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "Belongs to proposition." },
    { kind: "many-to-one", field: "task_id", targetEntity: "DispatchTask", targetField: "id", description: "Belongs to dispatch task." },
    { kind: "one-to-one", field: "review", targetEntity: "ResponseReview", targetField: "response_id", description: "Single review row." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal response primary key." },
    { kind: "unique", fields: ["task_id", "response_version"], description: "Version uniqueness per task." },
    { kind: "index", fields: ["proposition_id", "user_id", "is_latest"], description: "Latest response lookup." },
  ],
  businessRules: [
    { rule: "latest_wins", description: "Only one latest response may exist per proposition and user path." },
  ],
};

export const RESPONSE_REVIEW_SCHEMA: SchemaModelContract = {
  entity: "ResponseReview",
  tableName: "response_review",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal review primary key." },
    { name: "response_id", type: "string", nullable: false, description: "Reviewed response." },
    { name: "status", type: "string", nullable: false, description: "Review status." },
    { name: "quality_score", type: "number", nullable: false, description: "Review score." },
    { name: "flags", type: "string[]", nullable: false, description: "Review anomaly flags." },
    { name: "reason_codes", type: "string[]", nullable: false, description: "Typed review reason codes." },
    { name: "reviewed_by_user_id", type: "string", nullable: true, description: "Review operator reference." },
    { name: "reviewed_at", type: "datetime", nullable: true, description: "Completion timestamp." },
  ],
  relations: [
    { kind: "one-to-one", field: "response_id", targetEntity: "Response", targetField: "id", description: "One review per response." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal review primary key." },
    { kind: "unique", fields: ["response_id"], description: "One-to-one response review mapping." },
  ],
  businessRules: [],
};

export const EFFECTIVE_SAMPLE_COUNTER_SCHEMA: SchemaModelContract = {
  entity: "EffectiveSampleCounter",
  tableName: "effective_sample_counter",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal counter primary key." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "total_responses", type: "number", nullable: false, description: "Latest-only response count at rebuild time." },
    { name: "valid_count", type: "number", nullable: false, description: "Valid sample count." },
    { name: "partial_valid_count", type: "number", nullable: false, description: "Partial-valid sample count." },
    { name: "invalid_count", type: "number", nullable: false, description: "Invalid reviewed count." },
    { name: "total_reviewed_count", type: "number", nullable: false, description: "All finalized latest reviews at rebuild time." },
    { name: "updated_at", type: "datetime", nullable: false, description: "Counter update timestamp." },
  ],
  relations: [
    { kind: "one-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "One counter per proposition." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal counter primary key." },
    { kind: "unique", fields: ["proposition_id"], description: "One counter per proposition." },
  ],
  businessRules: [
    { rule: "effective_sample_formula", description: "effective_sample_count = valid_count + partial_valid_count." },
  ],
};

export const MARKET_SCHEMA: SchemaModelContract = {
  entity: "Market",
  tableName: "market",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal market primary key." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "settlement_target", type: "string", nullable: false, description: "Locked to final." },
    { name: "status", type: "string", nullable: false, description: "Market lifecycle status." },
    { name: "current_public_progress", type: "json", nullable: true, description: "Progress-only public snapshot." },
    { name: "last_public_result", type: "json", nullable: true, description: "Last published official result snapshot." },
    { name: "live_at", type: "datetime", nullable: true, description: "Market live time." },
    { name: "frozen_at", type: "datetime", nullable: true, description: "Reveal freeze time." },
    { name: "settling_at", type: "datetime", nullable: true, description: "Settlement start time." },
    { name: "settled_at", type: "datetime", nullable: true, description: "Settlement completion time." },
  ],
  relations: [
    { kind: "one-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "One market per proposition." },
    { kind: "one-to-many", field: "positions", targetEntity: "PositionBet", targetField: "market_id", description: "User positions in the market." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal market primary key." },
    { kind: "unique", fields: ["proposition_id"], description: "One-to-one proposition market mapping." },
  ],
  businessRules: [
    { rule: "single_market_per_proposition", description: "Every proposition owns at most one market." },
  ],
};

export const POSITION_BET_SCHEMA: SchemaModelContract = {
  entity: "PositionBet",
  tableName: "position_bet",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal position primary key." },
    { name: "market_id", type: "string", nullable: false, description: "Owning market." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "user_id", type: "string", nullable: false, description: "Outer user reference." },
    { name: "selected_option", type: "number", nullable: false, description: "Selected binary side." },
    { name: "stake_amount", type: "string", nullable: false, description: "Bet amount." },
    { name: "placed_at", type: "datetime", nullable: false, description: "Bet placement time." },
    { name: "settlement_outcome", type: "string", nullable: true, description: "Won, lost, or refund." },
    { name: "gross_payout", type: "string", nullable: true, description: "Gross payout amount." },
    { name: "pnl", type: "string", nullable: true, description: "Profit and loss amount." },
    { name: "refund_amount", type: "string", nullable: true, description: "Refund amount for void rounds." },
    { name: "settled_at", type: "datetime", nullable: true, description: "Settlement completion timestamp." },
  ],
  relations: [
    { kind: "many-to-one", field: "market_id", targetEntity: "Market", targetField: "id", description: "Belongs to a market." },
    { kind: "many-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "Belongs to a proposition." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal position primary key." },
    { kind: "unique", fields: ["market_id", "user_id"], description: "Locks one position per user per market." },
    { kind: "index", fields: ["proposition_id", "user_id"], description: "Lookup by proposition and user." },
  ],
  businessRules: [
    { rule: "single_position_per_market_user", description: "A user may hold only one position in a market." },
  ],
};

export const REWARD_LEDGER_SCHEMA: SchemaModelContract = {
  entity: "RewardLedger",
  tableName: "reward_ledger",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal reward ledger primary key." },
    { name: "user_id", type: "string", nullable: false, description: "Outer user reference." },
    { name: "proposition_id", type: "string", nullable: false, description: "Owning proposition." },
    { name: "response_id", type: "string", nullable: false, description: "Linked response." },
    { name: "source_type", type: "string", nullable: false, description: "Reward source type." },
    { name: "source_id", type: "string", nullable: false, description: "Source reference." },
    { name: "ledger_version", type: "number", nullable: false, description: "Monotonic version within the same response reward path." },
    { name: "pending_amount", type: "string", nullable: false, description: "Pre-review reward amount." },
    { name: "final_amount", type: "string", nullable: true, description: "Resolved reward amount after review." },
    { name: "status", type: "string", nullable: false, description: "pending, finalized, voided, or reversed." },
    { name: "review_status", type: "string", nullable: true, description: "Applied review outcome that produced this ledger state." },
    { name: "created_at", type: "datetime", nullable: false, description: "Creation timestamp." },
    { name: "finalized_at", type: "datetime", nullable: true, description: "Timestamp when a reward became payable-in-principle after review." },
    { name: "voided_at", type: "datetime", nullable: true, description: "Timestamp when review voided the pending reward." },
    { name: "reversed_at", type: "datetime", nullable: true, description: "Timestamp when a previously resolved ledger entry was superseded." },
    { name: "reversal_of_ledger_id", type: "string", nullable: true, description: "Back-reference to the ledger entry this row replaces." },
    { name: "reason_code", type: "string", nullable: true, description: "Typed audit reason for finalization, voiding, or reversal." },
  ],
  relations: [
    { kind: "many-to-one", field: "proposition_id", targetEntity: "Proposition", targetField: "id", description: "Belongs to a proposition." },
    { kind: "many-to-one", field: "response_id", targetEntity: "Response", targetField: "id", description: "Tracks the response that earned or lost the reward." },
  ],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal reward ledger primary key." },
    { kind: "index", fields: ["proposition_id", "user_id", "source_type"], description: "Lookup for a user's reward path under one proposition." },
    { kind: "index", fields: ["response_id", "ledger_version"], description: "Revision history lookup for one response reward path." },
    { kind: "index", fields: ["user_id", "status"], description: "Respondent reward inbox lookup." },
  ],
  businessRules: [
    { rule: "mvp_source_type_response_only", description: "MVP only activates source_type=response even though other source types are reserved." },
    { rule: "review_drives_resolution", description: "Submission only creates pending entries; review converts them into finalized or voided entries." },
    { rule: "correction_creates_reversal_trace", description: "If a review outcome changes, the previously resolved entry is marked reversed before a new current entry is created." },
  ],
};

export const USER_REPUTATION_SCHEMA: SchemaModelContract = {
  entity: "UserReputation",
  tableName: "user_reputation",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal reputation snapshot primary key." },
    { name: "user_id", type: "string", nullable: false, description: "Outer user reference keyed by wallet/JWT subject." },
    { name: "reputation_score", type: "number", nullable: false, description: "Current explainable quality reputation score." },
    { name: "reputation_level", type: "string", nullable: false, description: "new, normal, trusted, or risky." },
    { name: "rule_version", type: "string", nullable: false, description: "Versioned rule set used to compute the snapshot." },
    { name: "metrics_json", type: "json", nullable: false, description: "Auditable counts and rates used in score computation." },
    { name: "computed_at", type: "datetime", nullable: false, description: "Computation timestamp for the current snapshot." },
    { name: "created_at", type: "datetime", nullable: false, description: "Snapshot creation timestamp." },
    { name: "updated_at", type: "datetime", nullable: false, description: "Snapshot update timestamp." },
  ],
  relations: [],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal reputation snapshot primary key." },
    { kind: "unique", fields: ["user_id"], description: "Exactly one current quality reputation snapshot per user." },
    { kind: "index", fields: ["reputation_level", "computed_at"], description: "Internal filtering by level and freshness." },
  ],
  businessRules: [
    { rule: "review_driven_quality_snapshot", description: "Current snapshot is recomputed from dispatch outcomes and finalized review records, not incrementally mutated counters." },
    { rule: "single_current_snapshot_per_user", description: "The table stores the latest stable quality reputation result per respondent." },
  ],
};

export const USER_TAG_SCHEMA: SchemaModelContract = {
  entity: "UserTag",
  tableName: "user_tag",
  fields: [
    { name: "id", type: "string", nullable: false, description: "Internal tag snapshot primary key." },
    { name: "user_id", type: "string", nullable: false, description: "Outer user reference keyed by wallet/JWT subject." },
    { name: "tag_key", type: "string", nullable: false, description: "Stable tag identifier such as high_quality or interested_in_sports." },
    { name: "tag_type", type: "string", nullable: false, description: "quality_reputation or interest." },
    { name: "tag_value", type: "string", nullable: false, description: "Current v1 tags are presence tags and therefore store active as the value." },
    { name: "confidence_score", type: "number", nullable: false, description: "Explainable 0-100 confidence score." },
    { name: "source_type", type: "string", nullable: false, description: "reputation or participation." },
    { name: "rule_version", type: "string", nullable: false, description: "Versioned rule set used to derive the tag." },
    { name: "metadata_json", type: "json", nullable: false, description: "Auditable source metrics and thresholds for the tag." },
    { name: "activated_at", type: "datetime", nullable: false, description: "When the current active tag first became active." },
    { name: "expires_at", type: "datetime", nullable: true, description: "When the tag stopped being current. Null means active." },
    { name: "created_at", type: "datetime", nullable: false, description: "Row creation timestamp." },
    { name: "updated_at", type: "datetime", nullable: false, description: "Last refresh timestamp." },
  ],
  relations: [],
  constraints: [
    { kind: "primary", fields: ["id"], description: "Internal tag snapshot primary key." },
    { kind: "unique", fields: ["user_id", "tag_key"], description: "Exactly one current snapshot row per user and tag key." },
    { kind: "index", fields: ["user_id", "tag_type", "expires_at"], description: "Current-tag lookup by user and type." },
  ],
  businessRules: [
    { rule: "refresh_overwrites_current_snapshot", description: "Tags are recomputed and upserted from source data rather than incrementally patched." },
    { rule: "expired_rows_are_not_current", description: "expires_at=null marks the tag as current; once a tag stops matching it is expired in place." },
  ],
};

export const ARENA_SCHEMA_MODELS: readonly SchemaModelContract[] = [
  PROPOSITION_SCHEMA,
  DISPATCH_TASK_SCHEMA,
  RESPONSE_SCHEMA,
  RESPONSE_REVIEW_SCHEMA,
  EFFECTIVE_SAMPLE_COUNTER_SCHEMA,
  MARKET_SCHEMA,
  POSITION_BET_SCHEMA,
  REWARD_LEDGER_SCHEMA,
  USER_REPUTATION_SCHEMA,
  USER_TAG_SCHEMA,
] as const;
