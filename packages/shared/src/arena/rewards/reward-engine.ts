import type {
  RecordRewardSubmissionInput,
  RebindRewardLedgerToLatestResponseInput,
  RewardReviewResolutionInput,
} from "../dto.js";
import type { Proposition, Response, RewardLedger } from "../entities.js";
import { PropositionNotFoundError, ResponseNotFoundError } from "../adjudication/errors.js";
import {
  INVALID_MULTIPLIER_DENOMINATOR,
  INVALID_MULTIPLIER_NUMERATOR,
  PARTIAL_VALID_MULTIPLIER_DENOMINATOR,
  PARTIAL_VALID_MULTIPLIER_NUMERATOR,
  VALID_MULTIPLIER_DENOMINATOR,
  VALID_MULTIPLIER_NUMERATOR,
} from "./constants.js";
import {
  InvalidRewardAmountError,
  RewardFinalizationInputMismatchError,
  RewardLedgerSourceMismatchError,
} from "./errors.js";
import type { RewardEngineDependencies } from "./ports.js";

const RESPONSE_SOURCE_TYPE = "response" as const;
const NON_NEGATIVE_INTEGER_PATTERN = /^[0-9]+$/;

const parseUnsignedAmount = (value: string, field: string): bigint => {
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
    throw new InvalidRewardAmountError(value, field);
  }

  return BigInt(value);
};

const toAmountString = (value: bigint, field: string): string => {
  if (value < 0n) {
    throw new InvalidRewardAmountError(value.toString(), field);
  }

  return value.toString();
};

const assertResponseMatchesSubmission = (
  proposition: Proposition,
  response: Response,
  userId: string,
): void => {
  if (response.propositionId !== proposition.id) {
    throw new RewardFinalizationInputMismatchError(
      `Response ${response.id} does not belong to proposition ${proposition.id}.`,
    );
  }

  if (response.userId !== userId) {
    throw new RewardFinalizationInputMismatchError(
      `Response ${response.id} does not belong to user ${userId}.`,
    );
  }
};

const assertResponseRewardSource = (ledger: RewardLedger): void => {
  if (ledger.sourceType !== RESPONSE_SOURCE_TYPE) {
    throw new RewardLedgerSourceMismatchError(ledger.id, ledger.sourceType);
  }
};

const buildPendingLedger = (
  proposition: Proposition,
  response: Response,
  ledgerId: string,
  createdAt: string,
  ledgerVersion: number,
  reversalOfLedgerId: string | null = null,
): RewardLedger => ({
  id: ledgerId,
  userId: response.userId,
  propositionId: proposition.id,
  responseId: response.id,
  sourceType: RESPONSE_SOURCE_TYPE,
  sourceId: response.id,
  ledgerVersion,
  pendingAmount: proposition.baseResponseReward,
  finalAmount: null,
  status: "pending",
  reviewStatus: null,
  createdAt,
  finalizedAt: null,
  voidedAt: null,
  reversedAt: null,
  reversalOfLedgerId,
  reasonCode: null,
});

const applyReviewMultiplier = (
  baseResponseReward: string,
  reviewStatus: RewardReviewResolutionInput["reviewStatus"],
): string => {
  const baseAmount = parseUnsignedAmount(
    baseResponseReward,
    "baseResponseReward",
  );

  switch (reviewStatus) {
    case "valid":
      return toAmountString(
        (baseAmount * VALID_MULTIPLIER_NUMERATOR) / VALID_MULTIPLIER_DENOMINATOR,
        "finalAmount",
      );
    case "partial_valid":
      return toAmountString(
        (baseAmount * PARTIAL_VALID_MULTIPLIER_NUMERATOR) /
          PARTIAL_VALID_MULTIPLIER_DENOMINATOR,
        "finalAmount",
      );
    case "invalid":
    case "fraud_suspected":
      return toAmountString(
        (baseAmount * INVALID_MULTIPLIER_NUMERATOR) /
          INVALID_MULTIPLIER_DENOMINATOR,
        "finalAmount",
      );
    case "pending_review":
    default:
      throw new RewardFinalizationInputMismatchError(
        `Review status ${reviewStatus} cannot resolve a reward ledger.`,
      );
  }
};

type RewardResolution = Pick<
  RewardLedger,
  "status" | "finalAmount" | "reviewStatus" | "reasonCode"
>;

const resolveReviewOutcome = (
  proposition: Proposition,
  reviewStatus: RewardReviewResolutionInput["reviewStatus"],
): RewardResolution => {
  const finalAmount = applyReviewMultiplier(
    proposition.baseResponseReward,
    reviewStatus,
  );

  switch (reviewStatus) {
    case "valid":
      return {
        status: "finalized",
        finalAmount,
        reviewStatus,
        reasonCode: "review_valid",
      };
    case "partial_valid":
      return {
        status: "finalized",
        finalAmount,
        reviewStatus,
        reasonCode: "review_partial_valid",
      };
    case "invalid":
      return {
        status: "voided",
        finalAmount,
        reviewStatus,
        reasonCode: "invalid_review",
      };
    case "fraud_suspected":
      return {
        status: "voided",
        finalAmount,
        reviewStatus,
        reasonCode: "fraud_suspected_review",
      };
    case "pending_review":
    default:
      throw new RewardFinalizationInputMismatchError(
        `Review status ${reviewStatus} cannot resolve a reward ledger.`,
      );
  }
};

const buildResolvedLedgerState = (
  ledger: RewardLedger,
  resolution: RewardResolution,
  resolvedAt: string,
): RewardLedger => ({
  ...ledger,
  finalAmount: resolution.finalAmount,
  status: resolution.status,
  reviewStatus: resolution.reviewStatus,
  finalizedAt: resolution.status === "finalized" ? resolvedAt : null,
  voidedAt: resolution.status === "voided" ? resolvedAt : null,
  reversedAt: null,
  reasonCode: resolution.reasonCode,
});

const buildReversedLedgerState = (
  ledger: RewardLedger,
  reversedAt: string,
  reasonCode: RewardLedger["reasonCode"],
): RewardLedger => ({
  ...ledger,
  status: "reversed",
  reversedAt,
  reasonCode,
});

const isSameResolution = (
  ledger: RewardLedger,
  resolution: RewardResolution,
): boolean =>
  ledger.status === resolution.status &&
  ledger.finalAmount === resolution.finalAmount &&
  ledger.reviewStatus === resolution.reviewStatus &&
  ledger.reasonCode === resolution.reasonCode;

export class RewardEngine {
  constructor(private readonly deps: RewardEngineDependencies) {}

  async getByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<RewardLedger | null> {
    return this.deps.ledgers.findLatestByPropositionAndUserAndSourceType(
      propositionId,
      userId,
      RESPONSE_SOURCE_TYPE,
    );
  }

  async listByUser(userId: string): Promise<RewardLedger[]> {
    return this.deps.ledgers.listByUser(userId);
  }

  async recordSubmission(
    input: RecordRewardSubmissionInput,
  ): Promise<RewardLedger> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    const response = await this.deps.responses.getById(input.responseId);
    if (!response) {
      throw new ResponseNotFoundError(input.responseId);
    }

    assertResponseMatchesSubmission(proposition, response, input.userId);

    const existingLedger = await this.getByPropositionAndUser(
      proposition.id,
      input.userId,
    );

    if (!existingLedger) {
      return this.deps.ledgers.create(
        buildPendingLedger(
          proposition,
          response,
          this.deps.ids.next("reward-ledger"),
          input.recordedAt,
          1,
        ),
      );
    }

    assertResponseRewardSource(existingLedger);

    if (existingLedger.responseId === response.id) {
      return existingLedger;
    }

    return this.rebindToLatestResponse({
      propositionId: proposition.id,
      userId: input.userId,
      responseId: response.id,
      reboundAt: input.recordedAt,
    });
  }

  async rebindToLatestResponse(
    input: RebindRewardLedgerToLatestResponseInput,
  ): Promise<RewardLedger> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    const response = await this.deps.responses.getById(input.responseId);
    if (!response) {
      throw new ResponseNotFoundError(input.responseId);
    }

    assertResponseMatchesSubmission(proposition, response, input.userId);

    const existingLedger = await this.getByPropositionAndUser(
      proposition.id,
      input.userId,
    );

    if (!existingLedger) {
      return this.deps.ledgers.create(
        buildPendingLedger(
          proposition,
          response,
          this.deps.ids.next("reward-ledger"),
          input.reboundAt,
          1,
        ),
      );
    }

    assertResponseRewardSource(existingLedger);

    if (existingLedger.responseId === response.id) {
      return existingLedger;
    }

    const reversedLedger =
      existingLedger.status === "reversed"
        ? existingLedger
        : await this.deps.ledgers.update(
            buildReversedLedgerState(
              existingLedger,
              input.reboundAt,
              "superseded_pending_latest",
            ),
          );

    return this.deps.ledgers.create(
      buildPendingLedger(
        proposition,
        response,
        this.deps.ids.next("reward-ledger"),
        input.reboundAt,
        reversedLedger.ledgerVersion + 1,
        reversedLedger.id,
      ),
    );
  }

  async resolveFromReview(
    input: RewardReviewResolutionInput,
  ): Promise<RewardLedger> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    const response = await this.deps.responses.getById(input.responseId);
    if (!response) {
      throw new ResponseNotFoundError(input.responseId);
    }

    assertResponseMatchesSubmission(proposition, response, response.userId);

    let ledger = await this.getByPropositionAndUser(
      proposition.id,
      response.userId,
    );

    if (!ledger) {
      ledger = await this.deps.ledgers.create(
        buildPendingLedger(
          proposition,
          response,
          this.deps.ids.next("reward-ledger"),
          input.resolvedAt,
          1,
        ),
      );
    }

    assertResponseRewardSource(ledger);

    if (!input.isLatest) {
      if (ledger.responseId !== response.id) {
        return ledger;
      }

      throw new RewardFinalizationInputMismatchError(
        `Response ${response.id} is marked non-latest but reward ledger ${ledger.id} still points at it.`,
      );
    }

    if (ledger.responseId !== response.id) {
      ledger = await this.rebindToLatestResponse({
        propositionId: proposition.id,
        userId: response.userId,
        responseId: response.id,
        reboundAt: input.resolvedAt,
      });
    }

    const resolution = resolveReviewOutcome(proposition, input.reviewStatus);

    if (isSameResolution(ledger, resolution)) {
      return ledger;
    }

    if (ledger.status === "pending") {
      return this.deps.ledgers.update(
        buildResolvedLedgerState(ledger, resolution, input.resolvedAt),
      );
    }

    const reversedLedger =
      ledger.status === "reversed"
        ? ledger
        : await this.deps.ledgers.update(
            buildReversedLedgerState(
              ledger,
              input.resolvedAt,
              "review_corrected",
            ),
          );

    const nextLedger = buildPendingLedger(
      proposition,
      response,
      this.deps.ids.next("reward-ledger"),
      input.resolvedAt,
      reversedLedger.ledgerVersion + 1,
      reversedLedger.id,
    );

    return this.deps.ledgers.create(
      buildResolvedLedgerState(nextLedger, resolution, input.resolvedAt),
    );
  }

  async finalizeFromReview(
    input: RewardReviewResolutionInput,
  ): Promise<RewardLedger> {
    return this.resolveFromReview(input);
  }
}
