import type { BetSettlementOutcome, BetStatus, MarketStatus } from "@prisma/client";

import { ArenaInvariantError, ArenaStateTransitionError } from "../arena.errors";

export type BetLifecycleStage =
  | "placed"
  | "locked"
  | "won"
  | "lost"
  | "refunded"
  | "cancelled";

const BET_LIFECYCLE_TRANSITIONS: Readonly<Record<BetLifecycleStage, readonly BetLifecycleStage[]>> = {
  placed: ["locked", "cancelled"],
  locked: ["won", "lost", "refunded"],
  won: [],
  lost: [],
  refunded: [],
  cancelled: [],
};

export function resolveBetLifecycleStage(
  status: BetStatus,
  settlementOutcome: BetSettlementOutcome | null,
  marketStatus: MarketStatus,
): BetLifecycleStage {
  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "placed") {
    return marketStatus === "live" ? "placed" : "locked";
  }

  if (status === "settled" && settlementOutcome === "won") {
    return "won";
  }

  if (status === "settled" && settlementOutcome === "lost") {
    return "lost";
  }

  if (status === "settled" && settlementOutcome === "refund") {
    return "refunded";
  }

  throw new ArenaInvariantError("bet.invalid_state", "Bet settlement state is inconsistent");
}

export function assertBetLifecycleTransition(
  currentStage: BetLifecycleStage,
  nextStage: BetLifecycleStage,
): void {
  if (currentStage === nextStage) {
    return;
  }

  if (!BET_LIFECYCLE_TRANSITIONS[currentStage].includes(nextStage)) {
    throw new ArenaStateTransitionError(
      "bet.invalid_transition",
      `Cannot transition bet from ${currentStage} to ${nextStage}`,
    );
  }
}
