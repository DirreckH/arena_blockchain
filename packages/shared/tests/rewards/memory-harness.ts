import { RewardEngine } from "../../src/arena/rewards/reward-engine.js";
import type { RewardLedgerRepositoryPort } from "../../src/arena/rewards/ports.js";
import type { Proposition, Response, RewardLedger } from "../../src/arena/entities.js";
import {
  InMemoryPropositionStore,
  InMemoryResponseRepository,
  SequenceIdGenerator,
  buildLiveProposition,
  createAdjudicationHarness,
} from "../adjudication/memory-harness.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class InMemoryRewardLedgerRepository
  implements RewardLedgerRepositoryPort
{
  private readonly ledgers = new Map<string, RewardLedger>();

  async create(ledger: RewardLedger): Promise<RewardLedger> {
    this.ledgers.set(ledger.id, clone(ledger));
    return clone(ledger);
  }

  async update(ledger: RewardLedger): Promise<RewardLedger> {
    this.ledgers.set(ledger.id, clone(ledger));
    return clone(ledger);
  }

  async getById(ledgerId: string): Promise<RewardLedger | null> {
    const ledger = this.ledgers.get(ledgerId);
    return ledger ? clone(ledger) : null;
  }

  async findLatestByPropositionAndUserAndSourceType(
    propositionId: string,
    userId: string,
    sourceType: RewardLedger["sourceType"],
  ): Promise<RewardLedger | null> {
    const ledger = Array.from(this.ledgers.values())
      .filter(
        (item) =>
          item.propositionId === propositionId &&
          item.userId === userId &&
          item.sourceType === sourceType,
      )
      .sort((left, right) => right.ledgerVersion - left.ledgerVersion)[0];

    return ledger ? clone(ledger) : null;
  }

  async findLatestByResponseId(responseId: string): Promise<RewardLedger | null> {
    const ledger = Array.from(this.ledgers.values())
      .filter((item) => item.responseId === responseId)
      .sort((left, right) => right.ledgerVersion - left.ledgerVersion)[0];

    return ledger ? clone(ledger) : null;
  }

  async listByResponseId(responseId: string): Promise<RewardLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((item) => item.responseId === responseId)
      .sort((left, right) => left.ledgerVersion - right.ledgerVersion)
      .map((ledger) => clone(ledger));
  }

  async listByUser(userId: string): Promise<RewardLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.ledgerVersion - left.ledgerVersion)
      .map((ledger) => clone(ledger));
  }

  snapshot(): RewardLedger[] {
    return Array.from(this.ledgers.values())
      .sort((left, right) => left.ledgerVersion - right.ledgerVersion)
      .map((ledger) => clone(ledger));
  }
}

export const buildResponse = (
  overrides: Partial<Response> = {},
): Response => ({
  id: "response-1",
  propositionId: "proposition-1",
  taskId: "task-1",
  userId: "user-1",
  responseVersion: 1,
  isLatest: true,
  selectedOption: 0,
  confirmationOption: 0,
  clientStartedAt: "2026-04-16T00:00:05.000Z",
  clientSubmittedAt: "2026-04-16T00:00:20.000Z",
  understandingAck: true,
  submittedAt: "2026-04-16T00:00:20.000Z",
  ...overrides,
});

export const createRewardHarness = (proposition?: Proposition) => {
  const ids = new SequenceIdGenerator();
  const propositionStore = new InMemoryPropositionStore();
  const responseRepository = new InMemoryResponseRepository();
  const rewardLedgerRepository = new InMemoryRewardLedgerRepository();

  if (proposition) {
    propositionStore.set(proposition);
  }

  return {
    ids,
    propositionStore,
    responseRepository,
    rewardLedgerRepository,
    rewardEngine: new RewardEngine({
      ids,
      propositionRead: propositionStore,
      responses: responseRepository,
      ledgers: rewardLedgerRepository,
    }),
  };
};

export {
  buildLiveProposition,
  createAdjudicationHarness,
};
