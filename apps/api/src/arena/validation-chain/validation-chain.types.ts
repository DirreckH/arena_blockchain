import type {
  Prisma,
  ValidationChainCursor,
  ValidationChainEvent,
  ValidationChainMarketStatus,
  ValidationChainResultKind,
  ValidationChainSyncStatus,
  ValidationChainVoidReason,
} from "@prisma/client";
import type { providers, utils } from "ethers";

export const VALIDATION_CHAIN_STREAM_KEY = "validation_market_main" as const;

export const VALIDATION_CHAIN_EVENT_NAMES = [
  "MarketCreated",
  "MarketOpened",
  "BetPlaced",
  "MarketFrozen",
  "MarketResolved",
  "MarketCancelled",
  "Claimed",
  "Refunded",
  "Paused",
  "Unpaused",
] as const;

export type ValidationChainEventName =
  (typeof VALIDATION_CHAIN_EVENT_NAMES)[number];

export type ValidationChainEnvironment =
  | "local"
  | "dev"
  | "staging"
  | "prod";

export interface ValidationChainEventRecordInput {
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  eventName: string;
  marketChainId?: string | null;
  propositionChainId?: string | null;
  payloadJson: Prisma.InputJsonValue;
  processedAt?: Date;
}

export interface ValidationChainEventInsertResult {
  event: ValidationChainEvent;
  inserted: boolean;
}

export interface ValidationChainCursorCheckpointInput {
  streamKey: string;
  chainId: number;
  contractAddress: string;
  lastProcessedBlock?: number | null;
  lastProcessedTxHash?: string | null;
  lastProcessedLogIndex?: number | null;
  lastFinalizedBlock?: number | null;
  syncStatus?: ValidationChainSyncStatus;
}

export interface ValidationChainCursorRangeQuery {
  chainId: number;
  contractAddress: string;
  fromBlock: number;
  toBlock: number;
  limit?: number;
}

export interface ValidationChainLogQuery {
  fromBlock: number;
  toBlock: number;
  topics?: Array<string | Array<string> | null>;
}

export interface ValidationChainSnapshot {
  rpcUrl: string;
  configuredChainId: number;
  contractAddress: string;
  confirmations: number;
  batchSize: number;
  artifactPath: string;
}

export type ValidationChainParsedLog = utils.LogDescription;
export type ValidationChainProviderLog = providers.Log;
export type ValidationChainCursorRecord = ValidationChainCursor;

export const VALIDATION_CHAIN_COMMAND_REASON_SYSTEM = "validation_chain.system";

export enum ValidationContractMarketState {
  Unset = 0,
  PreLive = 1,
  Live = 2,
  Frozen = 3,
  Resolved = 4,
  Cancelled = 5,
}

export enum ValidationContractResultKind {
  None = 0,
  Resolved = 1,
  Void = 2,
}

export enum ValidationContractVoidReason {
  None = 0,
  InsufficientSample = 1,
  Tie = 2,
}

export interface ValidationContractMarketView {
  marketId: string;
  propositionId: string;
  state: ValidationContractMarketState;
  minStake: string;
  resultKind: ValidationContractResultKind;
  winningOption: number;
  voidReason: ValidationContractVoidReason;
  openedAt: number;
  frozenAt: number;
  resolvedAt: number;
  cancelledAt: number;
  cancelReasonCode: string;
}

export interface ValidationChainCommandResult {
  propositionId: string;
  marketId: string;
  chainPropositionId: string;
  chainMarketId: string;
  txHash: string;
  attemptedAt: string;
  retryable: boolean;
}

export type ValidationChainAutomaticCommand =
  | "create_market"
  | "open_market"
  | "freeze_market"
  | "resolve_market";

export interface ValidationChainCommandJobPayload {
  command: ValidationChainAutomaticCommand;
  propositionId: string;
  actorUserId?: string | null;
  reason: string;
  note?: string;
  requestedAt: string;
}

export interface ValidationChainAdminCommandResult {
  txHash: string;
  attemptedAt: string;
  retryable: boolean;
  contractAddress: string;
}

export interface ValidationChainSyncSnapshot {
  streamKey: string;
  latestBlock: number;
  safeToBlock: number;
  processedEvents: number;
  fromBlock: number | null;
  toBlock: number | null;
}

export interface ValidationChainBasePayload {
  blockTimestamp: number;
}

export interface ValidationChainMarketCreatedPayload extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  minStake: string;
  operator: string;
}

export interface ValidationChainMarketOpenedPayload extends ValidationChainBasePayload {
  marketId: string;
  openedAt: number;
  operator: string;
}

export interface ValidationChainBetPlacedPayload extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  user: string;
  selectedOption: number;
  amount: string;
}

export interface ValidationChainMarketFrozenPayload extends ValidationChainBasePayload {
  marketId: string;
  frozenAt: number;
  operator: string;
}

export interface ValidationChainMarketResolvedPayload
  extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  resultKind: ValidationChainResultKind;
  winningOption: number | null;
  voidReason: ValidationChainVoidReason | null;
  resolvedAt: number;
  oracle: string;
}

export interface ValidationChainMarketCancelledPayload
  extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  reasonCode: string;
  cancelledAt: number;
  operator: string;
}

export interface ValidationChainClaimedPayload extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  user: string;
  amount: string;
}

export interface ValidationChainRefundedPayload extends ValidationChainBasePayload {
  marketId: string;
  propositionId: string;
  user: string;
  amount: string;
}

export interface ValidationChainPausePayload extends ValidationChainBasePayload {
  account: string;
}

export type ValidationChainEventPayload =
  | ValidationChainMarketCreatedPayload
  | ValidationChainMarketOpenedPayload
  | ValidationChainBetPlacedPayload
  | ValidationChainMarketFrozenPayload
  | ValidationChainMarketResolvedPayload
  | ValidationChainMarketCancelledPayload
  | ValidationChainClaimedPayload
  | ValidationChainRefundedPayload
  | ValidationChainPausePayload;

export class ValidationChainProcessingError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ValidationChainProcessingError";
  }
}

export function toValidationChainMarketStatus(
  state: ValidationContractMarketState,
): ValidationChainMarketStatus | null {
  switch (state) {
    case ValidationContractMarketState.PreLive:
      return "pre_live";
    case ValidationContractMarketState.Live:
      return "live";
    case ValidationContractMarketState.Frozen:
      return "frozen";
    case ValidationContractMarketState.Resolved:
      return "resolved";
    case ValidationContractMarketState.Cancelled:
      return "cancelled";
    default:
      return null;
  }
}

export class ValidationChainContractError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ValidationChainContractError";
  }
}
