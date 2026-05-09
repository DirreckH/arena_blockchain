import type { DispatchTask, Proposition } from "../entities.js";
import { ARENA_ADJUDICATION_DEFAULTS } from "./constants.js";
import {
  DispatchIneligibleError,
  DispatchTaskNotFoundError,
  InvalidDispatchTransitionError,
  PropositionNotFoundError,
  PropositionNotLiveError,
  TaskExpiredError,
  TaskOwnershipMismatchError,
} from "./errors.js";
import type {
  DispatchCandidateSnapshot,
  DispatchEligibilityResult,
  DispatchEngineDependencies,
  DispatchTransitionResult,
  ExpireDispatchTaskInput,
  SkipDispatchTaskInput,
  StartDispatchTaskInput,
} from "./ports.js";

const ACTIVE_TASK_STATUSES = new Set(["assigned", "started"]);

const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const minIso = (left: string, right: string): string =>
  new Date(left).getTime() <= new Date(right).getTime() ? left : right;

const isExpiredAt = (timestamp: string, expiresAt: string): boolean =>
  new Date(timestamp).getTime() >= new Date(expiresAt).getTime();

export class DispatchEngine {
  constructor(private readonly deps: DispatchEngineDependencies) {}

  evaluateEligibility(
    candidate: DispatchCandidateSnapshot,
    proposition: Proposition,
  ): DispatchEligibilityResult {
    if (proposition.status !== "live") {
      return { eligible: false, reason: "proposition_not_live" };
    }

    if (candidate.userStatus !== "active") {
      return { eligible: false, reason: "user_not_active" };
    }

    if (!candidate.matchesSampleConstraints) {
      return { eligible: false, reason: "sample_constraints_mismatch" };
    }

    if (
      candidate.activeTaskCount >=
      ARENA_ADJUDICATION_DEFAULTS.maxActiveTasksPerUser
    ) {
      return { eligible: false, reason: "user_task_quota_reached" };
    }

    if (candidate.hasActiveTaskForProposition) {
      return { eligible: false, reason: "existing_active_task" };
    }

    if (candidate.hasSubmittedTaskForProposition) {
      return { eligible: false, reason: "existing_submitted_task" };
    }

    if (candidate.isInCooldown) {
      return { eligible: false, reason: "dispatch_cooldown" };
    }

    return { eligible: true, reason: null };
  }

  async assign(
    candidate: DispatchCandidateSnapshot,
    proposition: Proposition,
    assignedAt: string,
  ): Promise<DispatchTask> {
    const eligibility = this.evaluateEligibility(candidate, proposition);
    if (!eligibility.eligible) {
      throw new DispatchIneligibleError(
        eligibility.reason ?? "proposition_not_live",
      );
    }

    if (proposition.status !== "live") {
      throw new PropositionNotLiveError(proposition.id);
    }

    const ttlExpiry = addSeconds(
      assignedAt,
      ARENA_ADJUDICATION_DEFAULTS.taskTtlSeconds,
    );
    const propositionCutoff = proposition.liveAt
      ? addSeconds(proposition.liveAt, proposition.maxDurationSeconds)
      : ttlExpiry;

    const task: DispatchTask = {
      id: this.deps.ids.next("dispatch-task"),
      propositionId: proposition.id,
      userId: candidate.userId,
      status: "assigned",
      assignedAt,
      startedAt: null,
      submittedAt: null,
      expiresAt: minIso(ttlExpiry, propositionCutoff),
      skipReason: null,
      expiryReason: null,
      cooldownUntil: null,
    };

    return this.deps.tasks.create(task);
  }

  async start(input: StartDispatchTaskInput): Promise<DispatchTask> {
    const task = await this.deps.tasks.getById(input.taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(input.taskId);
    }

    const proposition = await this.deps.propositionRead.getById(task.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(task.propositionId);
    }

    if (proposition.status !== "live") {
      throw new PropositionNotLiveError(proposition.id);
    }

    if (task.userId !== input.userId) {
      throw new TaskOwnershipMismatchError(task.id, input.userId);
    }

    if (task.status !== "assigned") {
      throw new InvalidDispatchTransitionError(task.id, task.status, "started");
    }

    if (isExpiredAt(input.startedAt, task.expiresAt)) {
      throw new TaskExpiredError(task.id, task.expiresAt);
    }

    const updated: DispatchTask = {
      ...task,
      status: "started",
      startedAt: input.startedAt,
    };

    return this.deps.tasks.update(updated);
  }

  async skip(input: SkipDispatchTaskInput): Promise<DispatchTransitionResult> {
    const task = await this.deps.tasks.getById(input.taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(input.taskId);
    }

    if (task.userId !== input.userId) {
      throw new TaskOwnershipMismatchError(task.id, input.userId);
    }

    if (!ACTIVE_TASK_STATUSES.has(task.status)) {
      throw new InvalidDispatchTransitionError(task.id, task.status, "skipped");
    }

    const updated: DispatchTask = {
      ...task,
      status: "skipped",
      skipReason: input.skipReason,
      cooldownUntil: addSeconds(
        input.skippedAt,
        ARENA_ADJUDICATION_DEFAULTS.cooldownSeconds,
      ),
    };

    return {
      task: await this.deps.tasks.update(updated),
      requeueRecommended: true,
    };
  }

  async expire(input: ExpireDispatchTaskInput): Promise<DispatchTransitionResult> {
    const task = await this.deps.tasks.getById(input.taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(input.taskId);
    }

    if (!ACTIVE_TASK_STATUSES.has(task.status)) {
      throw new InvalidDispatchTransitionError(task.id, task.status, "expired");
    }

    const updated: DispatchTask = {
      ...task,
      status: "expired",
      expiryReason: input.expiryReason,
      cooldownUntil: addSeconds(
        input.expiredAt,
        ARENA_ADJUDICATION_DEFAULTS.cooldownSeconds,
      ),
    };

    return {
      task: await this.deps.tasks.update(updated),
      requeueRecommended: true,
    };
  }
}
