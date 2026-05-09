import type { PropositionStatus } from "@prisma/client";

import { ArenaStateTransitionError } from "../arena.errors";

const PROPOSITION_TRANSITIONS: Record<
  PropositionStatus,
  readonly PropositionStatus[]
> = {
  draft: ["scheduled", "live", "archived"],
  scheduled: ["live", "archived"],
  live: ["frozen", "closed"],
  frozen: ["revealing", "closed"],
  revealing: ["settled", "closed"],
  settled: ["closed", "archived"],
  closed: ["archived"],
  archived: [],
};

export const getAllowedPropositionTransitions = (
  status: PropositionStatus,
): readonly PropositionStatus[] => PROPOSITION_TRANSITIONS[status];

export const assertPropositionTransition = (
  current: PropositionStatus,
  next: PropositionStatus,
  action: string,
): void => {
  if (!getAllowedPropositionTransitions(current).includes(next)) {
    throw new ArenaStateTransitionError("Proposition", current, next, action);
  }
};
