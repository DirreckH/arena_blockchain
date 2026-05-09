import type { ArenaIdGeneratorPort, PropositionReadPort } from "../adjudication/ports.js";
import type { Response, RewardLedger } from "../entities.js";
import type { RewardLedgerSourceType } from "../enums.js";

export type { ArenaIdGeneratorPort, PropositionReadPort } from "../adjudication/ports.js";

export interface ResponseReadPort {
  getById(responseId: string): Promise<Response | null>;
}

export interface RewardLedgerRepositoryPort {
  create(ledger: RewardLedger): Promise<RewardLedger>;
  update(ledger: RewardLedger): Promise<RewardLedger>;
  getById(ledgerId: string): Promise<RewardLedger | null>;
  findLatestByPropositionAndUserAndSourceType(
    propositionId: string,
    userId: string,
    sourceType: RewardLedgerSourceType,
  ): Promise<RewardLedger | null>;
  findLatestByResponseId(responseId: string): Promise<RewardLedger | null>;
  listByResponseId(responseId: string): Promise<RewardLedger[]>;
  listByUser(userId: string): Promise<RewardLedger[]>;
}

export interface RewardEngineDependencies {
  ids: ArenaIdGeneratorPort;
  propositionRead: PropositionReadPort;
  responses: ResponseReadPort;
  ledgers: RewardLedgerRepositoryPort;
}
