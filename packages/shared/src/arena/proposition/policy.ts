import type { PropositionRuntimeSnapshot } from "../dto.js";
import type { Market, Proposition } from "../entities.js";
import {
  RESPONDENT_INTEREST_TAG_KEYS,
  RESPONDENT_QUALITY_TAG_KEYS,
} from "../tags/constants.js";
import { PropositionPolicyError } from "./errors.js";

export const ARENA_PROPOSITION_MVP_LIMITS = {
  effectiveSample: {
    min: 1,
    max: 1000,
  },
  durationSeconds: {
    min: 30,
    max: 604_800,
  },
} as const;

export const ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS = [
  ...RESPONDENT_QUALITY_TAG_KEYS,
  ...RESPONDENT_INTEREST_TAG_KEYS,
  "wallet_signed",
  "experienced_user",
] as const;

const EXECUTABLE_SAMPLE_CONSTRAINT_SET = new Set<string>(
  ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS,
);

const fail = (code: string, message: string): never => {
  throw new PropositionPolicyError(code, message);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);

const isNonNegativeIntegerString = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9]+$/.test(value);

const parseIsoTimestamp = (value: string, field: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail(
      `proposition.invalid_${field}`,
      `${field} must be a valid ISO timestamp.`,
    );
  }

  return timestamp;
};

const parseAmount = (value: unknown, field: string): bigint => {
  if (!isNonNegativeIntegerString(value)) {
    fail(
      `proposition.invalid_${field}`,
      `${field} must be a non-negative integer string.`,
    );
  }

  return BigInt(value as string);
};

const assertSupportedSampleConstraints = (value: unknown): void => {
  if (!Array.isArray(value)) {
    fail(
      "proposition.invalid_sample_constraints",
      "sampleConstraints must be an array.",
    );
  }

  const constraints = value as unknown[];

  for (const constraint of constraints) {
    if (typeof constraint !== "string") {
      fail(
        "proposition.invalid_sample_constraints",
        "sampleConstraints must contain only strings.",
      );
    }

    const normalizedConstraint = constraint as string;

    if (!EXECUTABLE_SAMPLE_CONSTRAINT_SET.has(normalizedConstraint)) {
      fail(
        "proposition.unsupported_sample_constraint",
        `Unsupported sample constraint: ${normalizedConstraint}.`,
      );
    }
  }
};

const assertSupportedIdentity = (input: {
  type: unknown;
  structure: unknown;
  rollingMode: unknown;
  settlementTarget: unknown;
}): void => {
  if (input.type !== "consensus") {
    fail(
      "proposition.unsupported_type",
      "当前仅支持 consensus proposition。",
    );
  }

  if (input.structure !== "binary") {
    fail(
      "proposition.unsupported_structure",
      "当前仅支持 binary options。",
    );
  }

  if (input.rollingMode !== "non_rolling") {
    fail(
      "proposition.unsupported_rolling_mode",
      "目前仅支持 non_rolling。",
    );
  }

  if (input.settlementTarget !== "final") {
    fail(
      "proposition.unsupported_settlement_target",
      "当前仅支持 final settlement target。",
    );
  }
};

const assertNoUnsupportedExtensionFields = (
  rawInput: Record<string, unknown>,
): void => {
  const unsupportedSingleQuestionKeys = [
    "questions",
    "questionCount",
    "questionnaire",
    "surveyQuestions",
  ];
  for (const key of unsupportedSingleQuestionKeys) {
    if (key in rawInput) {
      fail(
        "proposition.unsupported_multi_question",
        `当前仅支持单题 consensus proposition，不支持 ${key} 扩展字段。`,
      );
    }
  }

  const unsupportedSurveyOrHybridKeys = [
    "surveyConfig",
    "hybridConfig",
    "hybridMarket",
    "questionnaireConfig",
  ];
  for (const key of unsupportedSurveyOrHybridKeys) {
    if (key in rawInput) {
      fail(
        "proposition.unsupported_extension_field",
        `当前 MVP 不支持 survey / hybrid 扩展字段：${key}。`,
      );
    }
  }

  const unsupportedRollingKeys = [
    "rollingWindow",
    "rollingSchedule",
    "rollingConfig",
  ];
  for (const key of unsupportedRollingKeys) {
    if (key in rawInput) {
      fail(
        "proposition.unsupported_rolling_extension",
        `目前仅支持 non_rolling，不支持 ${key} 扩展字段。`,
      );
    }
  }
};

export const assertSupportedMvpPropositionDraftInput = (
  rawInput: unknown,
): void => {
  if (!isPlainObject(rawInput)) {
    fail(
      "proposition.invalid_payload",
      "Proposition draft input must be an object.",
    );
  }

  const input = rawInput as Record<string, unknown>;

  assertNoUnsupportedExtensionFields(input);

  assertSupportedIdentity({
    type: input.type ?? "consensus",
    structure: input.structure ?? "binary",
    rollingMode: input.rollingMode ?? "non_rolling",
    settlementTarget: input.settlementTarget ?? "final",
  });

  if ("sampleConstraints" in input) {
    assertSupportedSampleConstraints(input.sampleConstraints);
  }
};

export const assertSupportedMvpPropositionConfig = (
  input: Pick<
    Proposition,
    | "type"
    | "structure"
    | "rollingMode"
    | "settlementTarget"
    | "options"
    | "sampleConstraints"
    | "minEffectiveSample"
    | "minDurationSeconds"
    | "maxDurationSeconds"
    | "minBetAmount"
    | "rewardBudget"
    | "baseResponseReward"
    | "marketEnabled"
  >,
): void => {
  assertSupportedIdentity(input);

  if (typeof input.marketEnabled !== "boolean") {
    fail(
      "proposition.invalid_market_enabled",
      "marketEnabled must be explicitly true or false.",
    );
  }

  if (input.options.length !== 2) {
    fail(
      "proposition.invalid_options",
      "当前仅支持 binary options，options 必须恰好两个。",
    );
  }

  assertSupportedSampleConstraints(input.sampleConstraints);

  if (
    !isFiniteInteger(input.minEffectiveSample) ||
    input.minEffectiveSample < ARENA_PROPOSITION_MVP_LIMITS.effectiveSample.min ||
    input.minEffectiveSample > ARENA_PROPOSITION_MVP_LIMITS.effectiveSample.max
  ) {
    fail(
      "proposition.invalid_min_effective_sample",
      `minEffectiveSample must be an integer between ${ARENA_PROPOSITION_MVP_LIMITS.effectiveSample.min} and ${ARENA_PROPOSITION_MVP_LIMITS.effectiveSample.max}.`,
    );
  }

  if (
    !isFiniteInteger(input.minDurationSeconds) ||
    input.minDurationSeconds < ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.min ||
    input.minDurationSeconds > ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.max
  ) {
    fail(
      "proposition.invalid_min_duration",
      `minDurationSeconds must be an integer between ${ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.min} and ${ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.max}.`,
    );
  }

  if (
    !isFiniteInteger(input.maxDurationSeconds) ||
    input.maxDurationSeconds < ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.min ||
    input.maxDurationSeconds > ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.max
  ) {
    fail(
      "proposition.invalid_max_duration",
      `maxDurationSeconds must be an integer between ${ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.min} and ${ARENA_PROPOSITION_MVP_LIMITS.durationSeconds.max}.`,
    );
  }

  if (input.minDurationSeconds > input.maxDurationSeconds) {
    fail(
      "proposition.invalid_duration_range",
      "minDurationSeconds must be less than or equal to maxDurationSeconds.",
    );
  }

  const minBetAmount = parseAmount(input.minBetAmount, "minBetAmount");
  parseAmount(input.rewardBudget, "rewardBudget");
  parseAmount(input.baseResponseReward, "baseResponseReward");

  if (input.marketEnabled && minBetAmount <= 0n) {
    fail(
      "proposition.invalid_market_min_bet",
      "启用验证层时，minBetAmount 必须大于 0。",
    );
  }
};

export const assertReadyForScheduling = (
  proposition: Proposition,
  publishedAt: string,
): void => {
  assertSupportedMvpPropositionConfig(proposition);
  parseIsoTimestamp(publishedAt, "publishedAt");
};

export const assertReadyForLivePublication = (
  proposition: Proposition,
  liveAt: string,
  market: Market | null,
): void => {
  assertSupportedMvpPropositionConfig(proposition);

  const liveTimestamp = parseIsoTimestamp(liveAt, "liveAt");
  if (
    proposition.publishedAt !== null &&
    liveTimestamp < parseIsoTimestamp(proposition.publishedAt, "publishedAt")
  ) {
    fail(
      "proposition.live_before_publish",
      "liveAt 不能早于 publishedAt。",
    );
  }

  if (proposition.marketEnabled) {
    if (
      market !== null &&
      market.status !== "pre_live" &&
      market.status !== "live"
    ) {
      fail(
        "proposition.market_not_ready_for_live",
        "验证层 market 必须处于 pre_live 才能进入 live。",
      );
    }
  } else if (market !== null) {
    fail(
      "proposition.market_disabled_conflict",
      "marketEnabled=false 的命题不应预先存在 validation market。",
    );
  }
};

export const buildPropositionRuntimeSnapshot = (input: {
  proposition: Proposition;
  market: Market | null;
}): PropositionRuntimeSnapshot => {
  assertSupportedMvpPropositionConfig(input.proposition);

  return {
    propositionId: input.proposition.id,
    type: input.proposition.type,
    structure: input.proposition.structure,
    rollingMode: input.proposition.rollingMode,
    settlementTarget: input.proposition.settlementTarget,
    category: input.proposition.category,
    title: input.proposition.title,
    description: input.proposition.description,
    options: input.proposition.options,
    marketEnabled: input.proposition.marketEnabled,
    status: input.proposition.status,
    timeRules: {
      publishedAt: input.proposition.publishedAt,
      liveAt: input.proposition.liveAt,
      minDurationSeconds: input.proposition.minDurationSeconds,
      maxDurationSeconds: input.proposition.maxDurationSeconds,
    },
    sampleRules: {
      minEffectiveSample: input.proposition.minEffectiveSample,
      sampleConstraints: [...input.proposition.sampleConstraints],
    },
    rewardPolicy: {
      rewardBudget: input.proposition.rewardBudget,
      baseResponseReward: input.proposition.baseResponseReward,
    },
    validationRuntime: {
      enabled: input.proposition.marketEnabled,
      marketId: input.market?.id ?? null,
      marketStatus: input.market?.status ?? null,
    },
  };
};
