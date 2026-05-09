import { DispatchEngine } from "../../src/arena/adjudication/dispatch-engine.js";
import { ResponseEngine } from "../../src/arena/adjudication/response-engine.js";
import { ReviewEngine } from "../../src/arena/adjudication/review-engine.js";
import { SampleCounterEngine } from "../../src/arena/adjudication/sample-counter-engine.js";
import type {
  ArenaIdGeneratorPort,
  DispatchCandidateSnapshot,
  DispatchTaskRepositoryPort,
  EffectiveSampleCounterRepositoryPort,
  PropositionReadPort,
  ResponseRepositoryPort,
  ResponseReviewRepositoryPort,
} from "../../src/arena/adjudication/ports.js";
import type {
  DispatchTask,
  EffectiveSampleCounter,
  Proposition,
  Response,
  ResponseReview,
} from "../../src/arena/entities.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class SequenceIdGenerator implements ArenaIdGeneratorPort {
  private readonly counters = new Map<string, number>();

  next(namespace: string): string {
    const nextValue = (this.counters.get(namespace) ?? 0) + 1;
    this.counters.set(namespace, nextValue);
    return `${namespace}-${nextValue}`;
  }
}

export class InMemoryPropositionStore implements PropositionReadPort {
  private readonly propositions = new Map<string, Proposition>();

  set(proposition: Proposition): Proposition {
    const stored = clone(proposition);
    this.propositions.set(stored.id, stored);
    return clone(stored);
  }

  async getById(propositionId: string): Promise<Proposition | null> {
    const proposition = this.propositions.get(propositionId);
    return proposition ? clone(proposition) : null;
  }
}

export class InMemoryDispatchTaskRepository implements DispatchTaskRepositoryPort {
  private readonly tasks = new Map<string, DispatchTask>();

  async create(task: DispatchTask): Promise<DispatchTask> {
    this.tasks.set(task.id, clone(task));
    return clone(task);
  }

  async update(task: DispatchTask): Promise<DispatchTask> {
    this.tasks.set(task.id, clone(task));
    return clone(task);
  }

  async getById(taskId: string): Promise<DispatchTask | null> {
    const task = this.tasks.get(taskId);
    return task ? clone(task) : null;
  }

  async listByUser(userId: string): Promise<DispatchTask[]> {
    return Array.from(this.tasks.values())
      .filter((task) => task.userId === userId)
      .map((task) => clone(task));
  }

  async findActiveByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTask | null> {
    const task = Array.from(this.tasks.values()).find(
      (item) =>
        item.propositionId === propositionId &&
        item.userId === userId &&
        (item.status === "assigned" || item.status === "started"),
    );

    return task ? clone(task) : null;
  }

  async listByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTask[]> {
    return Array.from(this.tasks.values())
      .filter(
        (task) => task.propositionId === propositionId && task.userId === userId,
      )
      .map((task) => clone(task));
  }

  snapshot(): DispatchTask[] {
    return Array.from(this.tasks.values()).map((task) => clone(task));
  }
}

export class InMemoryResponseRepository implements ResponseRepositoryPort {
  private readonly responses = new Map<string, Response>();

  async create(response: Response): Promise<Response> {
    this.responses.set(response.id, clone(response));
    return clone(response);
  }

  async update(response: Response): Promise<Response> {
    this.responses.set(response.id, clone(response));
    return clone(response);
  }

  async getById(responseId: string): Promise<Response | null> {
    const response = this.responses.get(responseId);
    return response ? clone(response) : null;
  }

  async findLatestByTaskId(taskId: string): Promise<Response | null> {
    const response = Array.from(this.responses.values())
      .filter((item) => item.taskId === taskId && item.isLatest)
      .sort((left, right) => right.responseVersion - left.responseVersion)[0];
    return response ? clone(response) : null;
  }

  async findLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<Response | null> {
    const response = Array.from(this.responses.values()).find(
      (item) =>
        item.propositionId === propositionId &&
        item.userId === userId &&
        item.isLatest,
    );
    return response ? clone(response) : null;
  }

  async listByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<Response[]> {
    return Array.from(this.responses.values())
      .filter(
        (response) =>
          response.propositionId === propositionId && response.userId === userId,
      )
      .sort((left, right) => left.responseVersion - right.responseVersion)
      .map((response) => clone(response));
  }

  async listLatestByProposition(propositionId: string): Promise<Response[]> {
    return Array.from(this.responses.values())
      .filter((response) => response.propositionId === propositionId && response.isLatest)
      .map((response) => clone(response));
  }

  snapshot(): Response[] {
    return Array.from(this.responses.values()).map((response) => clone(response));
  }
}

export class InMemoryResponseReviewRepository
  implements ResponseReviewRepositoryPort
{
  private readonly reviews = new Map<string, ResponseReview>();

  constructor(private readonly responses: InMemoryResponseRepository) {}

  async create(review: ResponseReview): Promise<ResponseReview> {
    this.reviews.set(review.responseId, clone(review));
    return clone(review);
  }

  async update(review: ResponseReview): Promise<ResponseReview> {
    this.reviews.set(review.responseId, clone(review));
    return clone(review);
  }

  async getByResponseId(responseId: string): Promise<ResponseReview | null> {
    const review = this.reviews.get(responseId);
    return review ? clone(review) : null;
  }

  async listByProposition(propositionId: string): Promise<ResponseReview[]> {
    const responses = this.responses.snapshot();
    const propositionResponseIds = new Set(
      responses
        .filter((response) => response.propositionId === propositionId)
        .map((response) => response.id),
    );

    return Array.from(this.reviews.values())
      .filter((review) => propositionResponseIds.has(review.responseId))
      .map((review) => clone(review));
  }

  snapshot(): ResponseReview[] {
    return Array.from(this.reviews.values()).map((review) => clone(review));
  }
}

export class InMemoryEffectiveSampleCounterRepository
  implements EffectiveSampleCounterRepositoryPort
{
  private readonly counters = new Map<string, EffectiveSampleCounter>();

  async upsert(counter: EffectiveSampleCounter): Promise<EffectiveSampleCounter> {
    this.counters.set(counter.propositionId, clone(counter));
    return clone(counter);
  }

  async getByPropositionId(
    propositionId: string,
  ): Promise<EffectiveSampleCounter | null> {
    const counter = this.counters.get(propositionId);
    return counter ? clone(counter) : null;
  }
}

export const buildLiveProposition = (
  overrides: Partial<Proposition> = {},
): Proposition => ({
  id: "proposition-1",
  chainPkId: null,
  type: "consensus",
  structure: "binary",
  rollingMode: "non_rolling",
  marketEnabled: true,
  settlementTarget: "final",
  category: "general",
  title: "Binary proposition",
  description: "Test proposition",
  options: ["Yes", "No"],
  sampleConstraints: [],
  minEffectiveSample: 2,
  minBetAmount: "100",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  rewardBudget: "100",
  baseResponseReward: "5",
  status: "live",
  resultKind: null,
  winningOption: null,
  voidReason: null,
  publishedAt: "2026-04-16T00:00:00.000Z",
  liveAt: "2026-04-16T00:00:00.000Z",
  frozenAt: null,
  revealStartedAt: null,
  resultComputedAt: null,
  settledAt: null,
  closedAt: null,
  archivedAt: null,
  createdByUserId: "operator-1",
  createdAt: "2026-04-15T23:59:00.000Z",
  updatedAt: "2026-04-15T23:59:00.000Z",
  ...overrides,
});

export const buildDispatchCandidate = (
  overrides: Partial<DispatchCandidateSnapshot> = {},
): DispatchCandidateSnapshot => ({
  userId: "user-1",
  userStatus: "active",
  matchesSampleConstraints: true,
  activeTaskCount: 0,
  hasActiveTaskForProposition: false,
  hasSubmittedTaskForProposition: false,
  isInCooldown: false,
  ...overrides,
});

export const createAdjudicationHarness = (proposition?: Proposition) => {
  const ids = new SequenceIdGenerator();
  const propositionStore = new InMemoryPropositionStore();
  const taskRepository = new InMemoryDispatchTaskRepository();
  const responseRepository = new InMemoryResponseRepository();
  const reviewRepository = new InMemoryResponseReviewRepository(responseRepository);
  const counterRepository = new InMemoryEffectiveSampleCounterRepository();

  if (proposition) {
    propositionStore.set(proposition);
  }

  return {
    ids,
    propositionStore,
    taskRepository,
    responseRepository,
    reviewRepository,
    counterRepository,
    dispatchEngine: new DispatchEngine({
      ids,
      propositionRead: propositionStore,
      tasks: taskRepository,
    }),
    responseEngine: new ResponseEngine({
      ids,
      propositionRead: propositionStore,
      tasks: taskRepository,
      responses: responseRepository,
      reviews: reviewRepository,
    }),
    reviewEngine: new ReviewEngine({
      propositionRead: propositionStore,
      tasks: taskRepository,
      responses: responseRepository,
      reviews: reviewRepository,
    }),
    counterEngine: new SampleCounterEngine({
      ids,
      responses: responseRepository,
      reviews: reviewRepository,
      counters: counterRepository,
    }),
  };
};
