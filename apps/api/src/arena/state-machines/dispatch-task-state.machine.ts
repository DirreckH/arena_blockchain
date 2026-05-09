import type { DispatchTaskStatus } from "@prisma/client";

import { ArenaStateTransitionError } from "../arena.errors";

const DISPATCH_TASK_TRANSITIONS: Record<
  DispatchTaskStatus,
  readonly DispatchTaskStatus[]
> = {
  assigned: ["started", "submitted", "skipped", "expired", "cancelled"],
  started: ["submitted", "skipped", "expired", "cancelled"],
  submitted: [],
  skipped: [],
  expired: [],
  cancelled: [],
};

export const getAllowedDispatchTaskTransitions = (
  status: DispatchTaskStatus,
): readonly DispatchTaskStatus[] => DISPATCH_TASK_TRANSITIONS[status];

export const assertDispatchTaskTransition = (
  current: DispatchTaskStatus,
  next: DispatchTaskStatus,
  action: string,
): void => {
  if (!getAllowedDispatchTaskTransitions(current).includes(next)) {
    throw new ArenaStateTransitionError("DispatchTask", current, next, action);
  }
};
