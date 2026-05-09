import type { MarketStatus } from "@prisma/client";

import { ArenaStateTransitionError } from "../arena.errors";

const MARKET_TRANSITIONS: Record<MarketStatus, readonly MarketStatus[]> = {
  pre_live: ["live", "cancelled"],
  live: ["frozen_for_reveal", "cancelled"],
  frozen_for_reveal: ["settling", "cancelled"],
  settling: ["settled", "cancelled"],
  settled: [],
  cancelled: [],
};

export const getAllowedMarketTransitions = (
  status: MarketStatus,
): readonly MarketStatus[] => MARKET_TRANSITIONS[status];

export const assertMarketTransition = (
  current: MarketStatus,
  next: MarketStatus,
  action: string,
): void => {
  if (!getAllowedMarketTransitions(current).includes(next)) {
    throw new ArenaStateTransitionError("Market", current, next, action);
  }
};
