import type { DispatchTask, Response, ResponseReview } from "../entities.js";
import type { SubmitResponseInput } from "../dto.js";
import {
  DispatchTaskNotFoundError,
  LateSubmissionError,
  PropositionNotFoundError,
  PropositionNotLiveError,
  ResponseRevisionMismatchError,
  TaskNotSubmittableError,
  TaskOwnershipMismatchError,
} from "./errors.js";
import type {
  ResponseEngineDependencies,
  SubmitResponseResult,
} from "./ports.js";

const FIRST_SUBMITTABLE_STATUSES = new Set(["assigned", "started"]);

const isLateSubmission = (submittedAt: string, expiresAt: string): boolean =>
  new Date(submittedAt).getTime() >= new Date(expiresAt).getTime();

const hasSamePayload = (
  left: Response,
  right: SubmitResponseInput,
): boolean =>
  left.selectedOption === right.selectedOption &&
  left.confirmationOption === right.confirmationOption &&
  left.clientStartedAt === right.clientStartedAt &&
  left.clientSubmittedAt === right.clientSubmittedAt &&
  left.understandingAck === right.understandingAck;

export class ResponseEngine {
  constructor(private readonly deps: ResponseEngineDependencies) {}

  async submit(input: SubmitResponseInput): Promise<SubmitResponseResult> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    if (proposition.status !== "live") {
      throw new PropositionNotLiveError(proposition.id);
    }

    const task = await this.deps.tasks.getById(input.taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(input.taskId);
    }

    if (task.userId !== input.userId) {
      throw new TaskOwnershipMismatchError(task.id, input.userId);
    }

    if (task.propositionId !== input.propositionId) {
      throw new TaskOwnershipMismatchError(task.id, input.userId);
    }

    if (isLateSubmission(input.submittedAt, task.expiresAt)) {
      throw new LateSubmissionError(task.id, input.submittedAt);
    }

    const latest = await this.deps.responses.findLatestByPropositionAndUser(
      input.propositionId,
      input.userId,
    );

    if (!latest) {
      if (!FIRST_SUBMITTABLE_STATUSES.has(task.status)) {
        throw new TaskNotSubmittableError(task.id, task.status);
      }

      const updatedTask: DispatchTask = {
        ...task,
        status: "submitted",
        submittedAt: input.submittedAt,
      };
      const persistedTask = await this.deps.tasks.update(updatedTask);

      const response: Response = {
        id: this.deps.ids.next("response"),
        propositionId: input.propositionId,
        taskId: input.taskId,
        userId: input.userId,
        responseVersion: 1,
        isLatest: true,
        selectedOption: input.selectedOption,
        confirmationOption: input.confirmationOption,
        clientStartedAt: input.clientStartedAt,
        clientSubmittedAt: input.clientSubmittedAt,
        understandingAck: input.understandingAck,
        submittedAt: input.submittedAt,
      };

      const review: ResponseReview = {
        id: this.deps.ids.next("response-review"),
        responseId: response.id,
        status: "pending_review",
        qualityScore: 0,
        flags: [],
        reasonCodes: [],
        reviewedByUserId: null,
        reviewedAt: null,
      };

      const persistedResponse = await this.deps.responses.create(response);
      await this.deps.reviews.create(review);

      return {
        response: persistedResponse,
        task: persistedTask,
        reviewRequested: true,
        duplicateRetry: false,
        counterRebuildRequired: true,
      };
    }

    if (latest.taskId !== input.taskId) {
      throw new ResponseRevisionMismatchError(input.taskId, latest.taskId);
    }

    if (hasSamePayload(latest, input)) {
      return {
        response: latest,
        task,
        reviewRequested: false,
        duplicateRetry: true,
        counterRebuildRequired: false,
      };
    }

    const updatedTask: DispatchTask = {
      ...task,
      status: "submitted",
      submittedAt: input.submittedAt,
    };
    const persistedTask = await this.deps.tasks.update(updatedTask);

    const response: Response = {
      id: this.deps.ids.next("response"),
      propositionId: input.propositionId,
      taskId: input.taskId,
      userId: input.userId,
      responseVersion: latest.responseVersion + 1,
      isLatest: true,
      selectedOption: input.selectedOption,
      confirmationOption: input.confirmationOption,
      clientStartedAt: input.clientStartedAt,
      clientSubmittedAt: input.clientSubmittedAt,
      understandingAck: input.understandingAck,
      submittedAt: input.submittedAt,
    };

    const review: ResponseReview = {
      id: this.deps.ids.next("response-review"),
      responseId: response.id,
      status: "pending_review",
      qualityScore: 0,
      flags: [],
      reasonCodes: [],
      reviewedByUserId: null,
      reviewedAt: null,
    };

    const persistedResponse = await this.deps.responses.create(response);
    await this.deps.reviews.create(review);

    // 新响应创建成功后才将旧响应标记为非最新，
    // 防止创建失败导致系统中没有 latest 响应的不一致状态
    const oldLatest: Response = { ...latest, isLatest: false };
    await this.deps.responses.update(oldLatest);

    return {
      response: persistedResponse,
      task: persistedTask,
      reviewRequested: true,
      duplicateRetry: false,
      counterRebuildRequired: true,
    };
  }
}
