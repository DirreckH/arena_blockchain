import type { RewardLedger } from "@prisma/client";

import { ArenaInvariantError, ArenaStateTransitionError } from "../arena.errors";

export type RewardLedgerLifecycleStage =
  | "pending"
  | "finalized"
  | "voided"
  | "reversed";

const REWARD_LEDGER_TRANSITIONS: Record<
  RewardLedgerLifecycleStage,
  readonly RewardLedgerLifecycleStage[]
> = {
  pending: ["finalized", "voided"],
  finalized: ["reversed"],
  voided: ["reversed"],
  reversed: [],
};

export const resolveRewardLedgerLifecycleStage = (
  ledger: Pick<
    RewardLedger,
    "status" | "finalizedAt" | "voidedAt" | "reversedAt"
  >,
): RewardLedgerLifecycleStage => {
  if (ledger.status === "reversed" || ledger.reversedAt !== null) {
    return "reversed";
  }

  if (ledger.status === "finalized") {
    return "finalized";
  }

  if (ledger.status === "voided") {
    return "voided";
  }

  if (ledger.status === "pending") {
    return "pending";
  }

  throw new ArenaInvariantError(
    `Unsupported reward ledger status combination: ${ledger.status}.`,
  );
};

export const getAllowedRewardLedgerTransitions = (
  stage: RewardLedgerLifecycleStage,
): readonly RewardLedgerLifecycleStage[] => REWARD_LEDGER_TRANSITIONS[stage];

export const assertRewardLedgerTransition = (
  current: RewardLedgerLifecycleStage,
  next: RewardLedgerLifecycleStage,
  action: string,
): void => {
  if (!getAllowedRewardLedgerTransitions(current).includes(next)) {
    throw new ArenaStateTransitionError("RewardLedger", current, next, action);
  }
};
