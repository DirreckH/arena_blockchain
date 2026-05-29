import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import type {
  Bet,
  Market,
  Proposition,
  SystemKeyValue,
  ValidationChainCursor,
  ValidationChainEvent,
} from "@prisma/client";
import { ethers, type providers } from "ethers";

import { ValidationChainOperatorCommandService } from "../../src/arena/validation-chain/validation-chain-operator-command.service";
import { ValidationChainOracleService } from "../../src/arena/validation-chain/validation-chain-oracle.service";
import { ValidationChainProjectionService } from "../../src/arena/validation-chain/validation-chain-projection.service";
import { ValidationChainSyncWorker } from "../../src/arena/validation-chain/validation-chain-sync.worker";
import { ValidationChainIdService } from "../../src/arena/validation-chain/validation-chain-id.service";
import { ValidationChainCommandRuntimeService } from "../../src/arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationRehearsalCheckpointService } from "../../src/arena/services/validation-rehearsal-checkpoint.service";
import { PropositionLifecycleAutomationService } from "../../src/arena/services/proposition-lifecycle-automation.service";
import { RequesterComparisonSetDeliveryAutomationService } from "../../src/arena/services/requester-comparison-set-delivery-automation.service";
import {
  VALIDATION_CHAIN_STREAM_KEY,
  type ValidationChainCommandJobPayload,
  type ValidationChainCommandResult,
  type ValidationContractMarketState,
  type ValidationContractMarketView,
} from "../../src/arena/validation-chain/validation-chain.types";
import { SchedulerQueueProcessor } from "../../src/queue/processors/scheduler.processor";
import {
  VALIDATION_CHAIN_COMMAND_JOB,
  VALIDATION_CHAIN_SYNC_JOB,
} from "../../src/queue/queue.constants";
import type { AppConfigService } from "../../src/config/app-config.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { ArenaIdService } from "../../src/arena/arena-id.service";

const clone = <T>(value: T): T => structuredClone(value);

const now = (offsetSeconds = 0): Date =>
  new Date(Date.UTC(2026, 3, 24, 0, 0, offsetSeconds));

function createConfigStub(): AppConfigService {
  return {
    chainId: 1337,
    validationEnvironment: "local",
  } as AppConfigService;
}

class FakeArenaIdService {
  private readonly sequences = new Map<string, number>();

  next(namespace: string): string {
    const current = this.sequences.get(namespace) ?? 0;
    const nextValue = current + 1;
    this.sequences.set(namespace, nextValue);
    return `${namespace}_${nextValue}`;
  }
}

interface ValidationChainHarness {
  propositions: Proposition[];
  markets: Market[];
  bets: Bet[];
  audits: Array<Record<string, unknown>>;
  events: ValidationChainEvent[];
  systemKeyValues: SystemKeyValue[];
  cursor: ValidationChainCursor | null;
  currentCursor: () => ValidationChainCursor | null;
  restartWorker: () => ValidationChainSyncWorker;
  contract: FakeValidationChainContractService;
  operator: ValidationChainOperatorCommandService;
  oracle: ValidationChainOracleService;
  projector: ValidationChainProjectionService;
  worker: ValidationChainSyncWorker;
  rehearsalCheckpoints: ValidationRehearsalCheckpointService;
}

interface ValidationChainSample {
  proposition: Proposition;
  market: Market;
  bet: Bet;
}

interface ValidationChainSampleBetOptions {
  betId?: string;
  userId?: string;
  selectedOption?: 0 | 1;
  stakeAmount?: string;
}

class FakePrismaService {
  async $transaction<T>(callback: (tx: FakePrismaService) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class FakePropositionRepository {
  constructor(private readonly propositions: Proposition[]) {}

  async findById(id: string): Promise<Proposition | null> {
    return clone(this.propositions.find((item) => item.id === id) ?? null);
  }
}

class FakeMarketRepository {
  constructor(private readonly markets: Market[]) {}

  async findById(id: string): Promise<Market | null> {
    return clone(this.markets.find((item) => item.id === id) ?? null);
  }

  async findByPropositionId(propositionId: string): Promise<Market | null> {
    return clone(
      this.markets.find((item) => item.propositionId === propositionId) ?? null,
    );
  }

  async findByChainMarketId(chainMarketId: string): Promise<Market | null> {
    return clone(
      this.markets.find((item) => item.chainMarketId === chainMarketId) ?? null,
    );
  }

  async findByChainPropositionId(
    chainPropositionId: string,
  ): Promise<Market | null> {
    return clone(
      this.markets.find(
        (item) => item.chainPropositionId === chainPropositionId,
      ) ?? null,
    );
  }

  async update(id: string, data: Partial<Market>): Promise<Market> {
    const market = this.markets.find((item) => item.id === id);
    if (!market) {
      throw new Error(`Market ${id} not found`);
    }

    Object.assign(market, clone(data), { updatedAt: now(99) });
    return clone(market);
  }
}

class FakeBetRepository {
  constructor(private readonly bets: Bet[]) {}

  async create(data: Partial<Bet> & Pick<Bet, "id" | "marketId" | "propositionId" | "userId" | "selectedOption" | "stakeAmount" | "placedAt">): Promise<Bet> {
    const record: Bet = {
      id: data.id,
      marketId: data.marketId,
      propositionId: data.propositionId,
      userId: data.userId,
      selectedOption: data.selectedOption,
      stakeAmount: data.stakeAmount,
      status: data.status ?? "placed",
      placedAt: data.placedAt,
      settledAt: data.settledAt ?? null,
      settlementOutcome: data.settlementOutcome ?? null,
      grossPayout: data.grossPayout ?? null,
      pnl: data.pnl ?? null,
      refundAmount: data.refundAmount ?? null,
      claimed: data.claimed ?? false,
      claimedAt: data.claimedAt ?? null,
      claimTxHash: data.claimTxHash ?? null,
      refundedAt: data.refundedAt ?? null,
      refundTxHash: data.refundTxHash ?? null,
      chainSyncedAt: data.chainSyncedAt ?? null,
      createdAt: data.createdAt ?? data.placedAt,
      updatedAt: data.updatedAt ?? data.placedAt,
    };

    this.bets.push(record);
    return clone(record);
  }

  async findByMarketAndUser(marketId: string, userId: string): Promise<Bet | null> {
    return clone(
      this.bets.find(
        (item) => item.marketId === marketId && item.userId === userId,
      ) ?? null,
    );
  }

  async listByMarketId(marketId: string): Promise<Bet[]> {
    return clone(this.bets.filter((item) => item.marketId === marketId));
  }

  async update(id: string, data: Partial<Bet>): Promise<Bet> {
    const bet = this.bets.find((item) => item.id === id);
    if (!bet) {
      throw new Error(`Bet ${id} not found`);
    }

    Object.assign(bet, clone(data), { updatedAt: now(99) });
    return clone(bet);
  }
}

class FakeSystemKeyValueRepository {
  constructor(private readonly systemKeyValues: SystemKeyValue[]) {}

  async findByKey(key: string): Promise<SystemKeyValue | null> {
    return clone(
      this.systemKeyValues.find(
        (item) => item.key === key && item.deletedAt === null,
      ) ?? null,
    );
  }

  async upsertByKey(
    key: string,
    create: any,
    update: any,
  ): Promise<SystemKeyValue> {
    const existing = this.systemKeyValues.find(
      (item) => item.key === key && item.deletedAt === null,
    );

    if (existing) {
      Object.assign(existing, clone(update), {
        deletedAt: null,
        updatedAt: now(95),
      });
      return clone(existing);
    }

    const record: SystemKeyValue = {
      id: create.id,
      key: create.key,
      valueJson: clone(create.valueJson ?? null),
      description: create.description ?? null,
      createdAt: create.createdAt ?? now(95),
      updatedAt: create.updatedAt ?? now(95),
      deletedAt: create.deletedAt ?? null,
    };

    this.systemKeyValues.push(record);
    return clone(record);
  }

  async listByKeyPrefix(keyPrefix: string): Promise<SystemKeyValue[]> {
    return clone(
      this.systemKeyValues
        .filter(
          (item) =>
            item.key.startsWith(keyPrefix) && item.deletedAt === null,
        )
        .sort(
          (left, right) =>
            right.updatedAt.getTime() - left.updatedAt.getTime() ||
            right.createdAt.getTime() - left.createdAt.getTime(),
        ),
    );
  }
}

class FakeAuditService {
  constructor(private readonly audits: Array<Record<string, unknown>>) {}

  async record(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const entry = { ...clone(input), createdAt: now(90).toISOString() };
    this.audits.push(entry);
    return entry;
  }
}

class FakeValidationChainCommandQueue {
  readonly commands: ValidationChainCommandJobPayload[] = [];

  async enqueueValidationChainCommand(
    payload: ValidationChainCommandJobPayload,
    _overrides: Record<string, unknown> = {},
  ) {
    this.commands.push(clone(payload));
    return {
      queue: "scheduler",
      name: VALIDATION_CHAIN_COMMAND_JOB,
      jobId: `validation-chain:${payload.command}:${payload.propositionId}:${this.commands.length}`,
    };
  }

  drain(): ValidationChainCommandJobPayload[] {
    return this.commands.splice(0, this.commands.length);
  }
}

class FakeValidationChainCommandAlerts {
  readonly enqueued: Array<Record<string, unknown>> = [];
  readonly skipped: Array<Record<string, unknown>> = [];
  readonly terminals: Array<Record<string, unknown>> = [];
  readonly exhausted: Array<Record<string, unknown>> = [];

  async recordCommandEnqueued(input: Record<string, unknown>): Promise<void> {
    this.enqueued.push(clone(input));
  }

  async recordCommandSkipped(input: Record<string, unknown>): Promise<void> {
    this.skipped.push(clone(input));
  }

  async recordCommandTerminal(input: Record<string, unknown>): Promise<void> {
    this.terminals.push(clone(input));
  }

  async recordCommandRetryExhausted(input: Record<string, unknown>): Promise<void> {
    this.exhausted.push(clone(input));
  }
}

class FakePropositionLifecycleAutomationService {
  async runDuePropositionTransitions() {
    return {
      processedAt: new Date().toISOString(),
      published: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
      revealPrepared: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
      settled: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
    };
  }
}

class FakeRequesterComparisonSetDeliveryAutomationService {
  async runDuePolicies(_input: { now: string }) {
    return {
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      items: [],
    };
  }
}

class FakeValidationChainEventRepository {
  constructor(private readonly events: ValidationChainEvent[]) {}

  async insertIfAbsent(input: Omit<ValidationChainEvent, "id"> & { id?: string }) {
    const existing = this.events.find(
      (event) =>
        event.chainId === input.chainId &&
        event.transactionHash === input.transactionHash &&
        event.logIndex === input.logIndex,
    );

    if (existing) {
      return { event: clone(existing), inserted: false };
    }

    const event: ValidationChainEvent = {
      id: input.id ?? `event_${this.events.length + 1}`,
      chainId: input.chainId,
      contractAddress: input.contractAddress,
      blockNumber: input.blockNumber,
      blockHash: input.blockHash,
      transactionHash: input.transactionHash,
      transactionIndex: input.transactionIndex,
      logIndex: input.logIndex,
      eventName: input.eventName,
      marketChainId: input.marketChainId ?? null,
      propositionChainId: input.propositionChainId ?? null,
      payloadJson: clone(input.payloadJson),
      processedAt: input.processedAt ?? now(80),
    };

    this.events.push(event);
    return { event: clone(event), inserted: true };
  }
}

class FakeValidationChainCursorRepository {
  constructor(private readonly state: { cursor: ValidationChainCursor | null }) {}

  async upsertCursor(input: {
    streamKey: string;
    chainId: number;
    contractAddress: string;
    lastProcessedBlock?: number | null;
    lastProcessedTxHash?: string | null;
    lastProcessedLogIndex?: number | null;
    lastFinalizedBlock?: number | null;
    syncStatus?: ValidationChainCursor["syncStatus"];
  }): Promise<ValidationChainCursor> {
    if (!this.state.cursor) {
      this.state.cursor = {
        streamKey: input.streamKey,
        chainId: input.chainId,
        contractAddress: input.contractAddress,
        lastProcessedBlock: input.lastProcessedBlock ?? null,
        lastProcessedTxHash: input.lastProcessedTxHash ?? null,
        lastProcessedLogIndex: input.lastProcessedLogIndex ?? null,
        lastFinalizedBlock: input.lastFinalizedBlock ?? null,
        syncStatus: input.syncStatus ?? "idle",
        createdAt: now(70),
        updatedAt: now(70),
      };
    } else {
      Object.assign(this.state.cursor, {
        chainId: input.chainId,
        contractAddress: input.contractAddress,
        lastProcessedBlock:
          input.lastProcessedBlock ?? this.state.cursor.lastProcessedBlock,
        lastProcessedTxHash:
          input.lastProcessedTxHash ?? this.state.cursor.lastProcessedTxHash,
        lastProcessedLogIndex:
          input.lastProcessedLogIndex ?? this.state.cursor.lastProcessedLogIndex,
        lastFinalizedBlock:
          input.lastFinalizedBlock ?? this.state.cursor.lastFinalizedBlock,
        syncStatus: input.syncStatus ?? this.state.cursor.syncStatus,
        updatedAt: now(70),
      });
    }

    return clone(this.state.cursor);
  }

  async updateProcessedCheckpoint(
    _streamKey: string,
    checkpoint: {
      lastProcessedBlock: number;
      lastProcessedTxHash?: string | null;
      lastProcessedLogIndex?: number | null;
      syncStatus?: ValidationChainCursor["syncStatus"];
    },
  ): Promise<ValidationChainCursor> {
    if (!this.state.cursor) {
      throw new Error("Cursor missing");
    }

    Object.assign(this.state.cursor, {
      lastProcessedBlock: checkpoint.lastProcessedBlock,
      lastProcessedTxHash: checkpoint.lastProcessedTxHash ?? null,
      lastProcessedLogIndex: checkpoint.lastProcessedLogIndex ?? null,
      syncStatus: checkpoint.syncStatus ?? this.state.cursor.syncStatus,
      updatedAt: now(71),
    });

    return clone(this.state.cursor);
  }

  async updateFinalizedBlock(
    _streamKey: string,
    lastFinalizedBlock: number,
    syncStatus?: ValidationChainCursor["syncStatus"],
  ): Promise<ValidationChainCursor> {
    if (!this.state.cursor) {
      throw new Error("Cursor missing");
    }

    Object.assign(this.state.cursor, {
      lastFinalizedBlock,
      syncStatus: syncStatus ?? this.state.cursor.syncStatus,
      updatedAt: now(72),
    });

    return clone(this.state.cursor);
  }
}

class FakeLogger {
  setContext(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class FakeValidationChainContractService {
  private readonly abi = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../../../artifacts/contracts/validation/ArenaValidationMarket.sol/ArenaValidationMarket.json",
      ),
      "utf8",
    ),
  ).abi;

  private readonly iface = new ethers.utils.Interface(this.abi);
  private readonly address = "0x0000000000000000000000000000000000000002";
  private readonly chainId = 1337;
  private readonly confirmations = 1;
  private readonly batchSize = 100;
  private readonly logs: providers.Log[] = [];
  private readonly blocks = new Map<number, { timestamp: number }>();
  private readonly chainMarkets = new Map<
    string,
    ValidationContractMarketView & {
      poolOption0: bigint;
      poolOption1: bigint;
    }
  >();
  private latestBlockNumber = 0;
  private txSequence = 0;

  getSnapshot() {
    return {
      rpcUrl: "http://127.0.0.1:8545",
      configuredChainId: this.chainId,
      contractAddress: this.address,
      confirmations: this.confirmations,
      batchSize: this.batchSize,
      artifactPath: "fake",
    };
  }

  getSupportedEventTopics(): string[] {
    return [
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
    ].map((eventName) => this.iface.getEventTopic(eventName));
  }

  parseLog(log: Pick<providers.Log, "topics" | "data">) {
    return this.iface.parseLog(log);
  }

  async getLatestBlockNumber(): Promise<number> {
    return this.latestBlockNumber;
  }

  async getLogs(input: {
    fromBlock: number;
    toBlock: number;
    topics?: Array<string | Array<string> | null>;
  }): Promise<providers.Log[]> {
    const topicFilter = Array.isArray(input.topics?.[0]) ? input.topics?.[0] : null;

    return clone(
      this.logs.filter((log) => {
        if (log.blockNumber < input.fromBlock || log.blockNumber > input.toBlock) {
          return false;
        }

        if (topicFilter && !topicFilter.includes(log.topics[0])) {
          return false;
        }

        return true;
      }),
    );
  }

  async getBlock(blockNumber: number): Promise<providers.Block> {
    const block = this.blocks.get(blockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }

    return { number: blockNumber, timestamp: block.timestamp } as providers.Block;
  }

  async getMarketOrNull(marketId: string): Promise<ValidationContractMarketView | null> {
    const market = this.chainMarkets.get(marketId);
    if (!market) {
      return null;
    }

    const { poolOption0: _poolOption0, poolOption1: _poolOption1, ...view } = market;
    return clone(view);
  }

  async sendCreateMarket(
    marketId: string,
    propositionId: string,
    minStake: string,
  ): Promise<providers.TransactionResponse> {
    if (this.chainMarkets.has(marketId)) {
      throw new Error("MarketAlreadyExists");
    }

    this.chainMarkets.set(marketId, {
      marketId,
      propositionId,
      state: 1,
      minStake,
      resultKind: 0,
      winningOption: 2,
      voidReason: 0,
      openedAt: 0,
      frozenAt: 0,
      resolvedAt: 0,
      cancelledAt: 0,
      cancelReasonCode: ethers.constants.HashZero,
      poolOption0: 0n,
      poolOption1: 0n,
    });

    return this.emit("MarketCreated", [
      marketId,
      propositionId,
      minStake,
      "0x00000000000000000000000000000000000000a1",
    ]);
  }

  async sendOpenMarket(marketId: string): Promise<providers.TransactionResponse> {
    const market = this.requireMarket(marketId);
    if (market.state !== 1) {
      throw new Error("InvalidMarketState");
    }

    const openedAt = this.peekNextTimestamp();
    market.state = 2;
    market.openedAt = openedAt;

    return this.emit("MarketOpened", [
      marketId,
      openedAt,
      "0x00000000000000000000000000000000000000a1",
    ]);
  }

  async sendFreezeMarket(marketId: string): Promise<providers.TransactionResponse> {
    const market = this.requireMarket(marketId);
    if (market.state !== 2) {
      throw new Error("InvalidMarketState");
    }

    const frozenAt = this.peekNextTimestamp();
    market.state = 3;
    market.frozenAt = frozenAt;

    return this.emit("MarketFrozen", [
      marketId,
      frozenAt,
      "0x00000000000000000000000000000000000000a1",
    ]);
  }

  async sendCancelMarket(
    marketId: string,
    reasonCode: string,
  ): Promise<providers.TransactionResponse> {
    const market = this.requireMarket(marketId);
    if (![1, 2, 3].includes(market.state)) {
      throw new Error("MarketNotCancellable");
    }

    const cancelledAt = this.peekNextTimestamp();
    market.state = 5;
    market.cancelledAt = cancelledAt;
    market.cancelReasonCode = reasonCode;

    return this.emit("MarketCancelled", [
      marketId,
      market.propositionId,
      reasonCode,
      cancelledAt,
      "0x00000000000000000000000000000000000000a1",
    ]);
  }

  async sendResolveMarket(payload: {
    marketId: string;
    propositionId: string;
    resultKind: number;
    winningOption: number;
    voidReason: number;
  }): Promise<providers.TransactionResponse> {
    const market = this.requireMarket(payload.marketId);
    if (market.state !== 3) {
      throw new Error("InvalidMarketState");
    }

    if (payload.resultKind === 1) {
      const winningPool =
        payload.winningOption === 0 ? market.poolOption0 : market.poolOption1;
      if (winningPool === 0n) {
        throw new Error("NoWinningPositions");
      }
    }

    const resolvedAt = this.peekNextTimestamp();
    market.state = 4;
    market.resultKind = payload.resultKind;
    market.winningOption = payload.winningOption;
    market.voidReason = payload.voidReason;
    market.resolvedAt = resolvedAt;

    return this.emit("MarketResolved", [
      payload.marketId,
      payload.propositionId,
      payload.resultKind,
      payload.winningOption,
      payload.voidReason,
      resolvedAt,
      "0x00000000000000000000000000000000000000b1",
    ]);
  }

  async emitBetPlacedForTest(input: {
    marketId: string;
    propositionId: string;
    user: string;
    selectedOption: 0 | 1;
    amount: string;
  }): Promise<void> {
    const market = this.requireMarket(input.marketId);
    if (market.state !== 2) {
      throw new Error("MarketNotLive");
    }

    if (input.selectedOption === 0) {
      market.poolOption0 += BigInt(input.amount);
    } else {
      market.poolOption1 += BigInt(input.amount);
    }

    await this.emit("BetPlaced", [
      input.marketId,
      input.propositionId,
      ethers.utils.getAddress(input.user),
      input.selectedOption,
      input.amount,
    ]);
  }

  async emitClaimedForTest(input: {
    marketId: string;
    propositionId: string;
    user: string;
    amount: string;
  }): Promise<void> {
    await this.emit("Claimed", [
      input.marketId,
      input.propositionId,
      ethers.utils.getAddress(input.user),
      input.amount,
    ]);
  }

  async emitRefundedForTest(input: {
    marketId: string;
    propositionId: string;
    user: string;
    amount: string;
  }): Promise<void> {
    await this.emit("Refunded", [
      input.marketId,
      input.propositionId,
      ethers.utils.getAddress(input.user),
      input.amount,
    ]);
  }

  mineEmptyBlock(): void {
    this.latestBlockNumber += 1;
    this.blocks.set(this.latestBlockNumber, {
      timestamp: 1_700_000_000 + this.latestBlockNumber,
    });
  }

  private requireMarket(marketId: string) {
    const market = this.chainMarkets.get(marketId);
    if (!market) {
      throw new Error("MarketNotFound");
    }

    return market;
  }

  private peekNextTimestamp(): number {
    return 1_700_000_000 + this.latestBlockNumber + 1;
  }

  private async emit(
    eventName: string,
    args: unknown[],
  ): Promise<providers.TransactionResponse> {
    const blockNumber = this.latestBlockNumber + 1;
    this.latestBlockNumber = blockNumber;
    this.blocks.set(blockNumber, { timestamp: 1_700_000_000 + blockNumber });
    this.txSequence += 1;

    const transactionHash = ethers.utils.hexZeroPad(
      ethers.utils.hexlify(this.txSequence),
      32,
    );

    const encoded = this.iface.encodeEventLog(this.iface.getEvent(eventName), args);
    const log: providers.Log = {
      address: this.address,
      blockNumber,
      blockHash: ethers.utils.hexZeroPad(ethers.utils.hexlify(blockNumber), 32),
      transactionIndex: 0,
      removed: false,
      logIndex: 0,
      transactionHash,
      data: encoded.data,
      topics: encoded.topics,
    };

    this.logs.push(log);

    return {
      hash: transactionHash,
      confirmations: 1,
      from: "0x00000000000000000000000000000000000000ff",
      wait: async () =>
        ({
          transactionHash,
          blockNumber,
          confirmations: 1,
          status: 1,
        }) as providers.TransactionReceipt,
    } as providers.TransactionResponse;
  }
}

function createHarness(input: { includeCounterpartyBet?: boolean } = {}): ValidationChainHarness {
  const propositions: Proposition[] = [];
  const markets: Market[] = [];
  const bets: Bet[] = [];
  appendValidationChainSample({ propositions, markets, bets }, 1);
  if (input.includeCounterpartyBet !== false) {
    appendValidationChainSample({ propositions, markets, bets }, 1, {
      betId: "bet_2",
      userId: "0x00000000000000000000000000000000000000c2",
      selectedOption: 1,
      stakeAmount: "200",
    });
  }

  const audits: Array<Record<string, unknown>> = [];
  const events: ValidationChainEvent[] = [];
  const systemKeyValues: SystemKeyValue[] = [];
  const cursorState = { cursor: null as ValidationChainCursor | null };

  const prisma = new FakePrismaService() as unknown as PrismaService;
  const propositionRepository =
    new FakePropositionRepository(propositions) as never;
  const marketRepository = new FakeMarketRepository(markets) as never;
  const betRepository = new FakeBetRepository(bets) as never;
  const arenaIds = new FakeArenaIdService() as unknown as ArenaIdService;
  const systemKeyValueRepository =
    new FakeSystemKeyValueRepository(systemKeyValues) as never;
  const auditService = new FakeAuditService(audits) as never;
  const idService = new ValidationChainIdService(createConfigStub());
  const contract = new FakeValidationChainContractService();
  const rehearsalCheckpoints = new ValidationRehearsalCheckpointService(
    prisma,
    arenaIds,
    createConfigStub(),
    propositionRepository,
    systemKeyValueRepository,
  );

  const operator = new ValidationChainOperatorCommandService(
    prisma,
    propositionRepository,
    marketRepository,
    idService,
    contract as never,
    auditService,
  );

  const oracle = new ValidationChainOracleService(
    prisma,
    propositionRepository,
    marketRepository,
    idService,
    contract as never,
    auditService,
  );

  const projector = new ValidationChainProjectionService(
    prisma,
    marketRepository,
    betRepository,
    arenaIds as never,
    auditService,
  );

  const worker = new ValidationChainSyncWorker(
    prisma,
    contract as never,
    new FakeValidationChainCursorRepository(cursorState) as never,
    new FakeValidationChainEventRepository(events) as never,
    marketRepository,
    projector,
    auditService,
    rehearsalCheckpoints,
    new FakeLogger() as never,
  );

  return {
    propositions,
    markets,
    bets,
    audits,
    events,
    systemKeyValues,
    cursor: cursorState.cursor,
    currentCursor: () => clone(cursorState.cursor),
    restartWorker: () =>
      new ValidationChainSyncWorker(
        prisma,
        contract as never,
        new FakeValidationChainCursorRepository(cursorState) as never,
        new FakeValidationChainEventRepository(events) as never,
        marketRepository,
        projector,
        auditService,
        rehearsalCheckpoints,
        new FakeLogger() as never,
      ),
    contract,
    operator,
    oracle,
    projector,
    worker,
    rehearsalCheckpoints,
  };
}

function appendValidationChainSample(
  state: Pick<ValidationChainHarness, "propositions" | "markets" | "bets">,
  index: number,
  betOverride: ValidationChainSampleBetOptions = {},
): ValidationChainSample {
  let proposition = state.propositions.find((item) => item.id === `prop_${index}`);
  if (!proposition) {
    proposition = {
      id: `prop_${index}`,
      chainPkId: null,
      type: "consensus",
      structure: "binary",
      rollingMode: "non_rolling",
      marketEnabled: true,
      settlementTarget: "final",
      category: "general",
      title: `Proposition ${index}`,
      description: "desc",
      options: ["Yes", "No"],
      sampleConstraints: [],
      minEffectiveSample: 10,
      minBetAmount: "100",
      minDurationSeconds: 60,
      maxDurationSeconds: 600,
      rewardBudget: "0",
      baseResponseReward: "0",
      status: "revealing",
      resultKind: "resolved",
      winningOption: 0,
      voidReason: null,
      publishedAt: now(1 + index),
      liveAt: now(2 + index),
      frozenAt: now(3 + index),
      revealStartedAt: now(4 + index),
      resultComputedAt: now(5 + index),
      settledAt: null,
      closedAt: null,
      archivedAt: null,
      createdByUserId: "system",
      updatedByUserId: "system",
      createdAt: now(index),
      updatedAt: now(index),
    };
    state.propositions.push(proposition);
  }

  let market = state.markets.find((item) => item.id === `market_${index}`);
  if (!market) {
    market = {
      id: `market_${index}`,
      propositionId: proposition.id,
      settlementTarget: "final",
      status: "frozen_for_reveal",
      chainMarketId: null,
      chainPropositionId: null,
      chainStatus: null,
      chainOpenedAt: null,
      chainFrozenAt: null,
      chainResolvedAt: null,
      chainCancelledAt: null,
      chainResultKind: null,
      chainWinningOption: null,
      chainVoidReason: null,
      resolutionTxHash: null,
      cancelTxHash: null,
      chainSyncedAt: null,
      currentPublicProgress: null,
      lastPublicResult: null,
      liveAt: now(2 + index),
      frozenAt: now(3 + index),
      settlingAt: null,
      settledAt: null,
      createdAt: now(index),
      updatedAt: now(index),
    };
    state.markets.push(market);
  }

  const betId = betOverride.betId ?? (index === 1 ? "bet_1" : `bet_${index}_main`);
  let bet = state.bets.find((item) => item.id === betId);
  if (!bet) {
    bet = {
      id: betId,
      marketId: market.id,
      propositionId: proposition.id,
      userId:
        typeof betOverride.userId === "string"
          ? betOverride.userId
          : `0x00000000000000000000000000000000000000c${index}`,
      selectedOption:
        typeof betOverride.selectedOption === "number"
          ? betOverride.selectedOption
          : 0,
      stakeAmount:
        typeof betOverride.stakeAmount === "string"
          ? betOverride.stakeAmount
          : String(300 + index * 100),
      status: "placed",
      placedAt: now(6 + index),
      settledAt: null,
      settlementOutcome: null,
      grossPayout: null,
      pnl: null,
      refundAmount: null,
      claimed: false,
      claimedAt: null,
      claimTxHash: null,
      refundedAt: null,
      refundTxHash: null,
      chainSyncedAt: null,
      createdAt: now(6 + index),
      updatedAt: now(6 + index),
    };
    state.bets.push(bet);
  }

  return { proposition, market, bet };
}

function createQueuedRehearsal(
  harness: ValidationChainHarness,
  worker: ValidationChainSyncWorker = harness.worker,
) {
  const queue = new FakeValidationChainCommandQueue();
  const alerts = new FakeValidationChainCommandAlerts();
  const commandRuntime = new ValidationChainCommandRuntimeService(
    queue as never,
    new FakeMarketRepository(harness.markets) as never,
    new ValidationChainIdService(createConfigStub()),
    harness.contract as never,
    harness.operator,
    harness.oracle,
    alerts as never,
    harness.rehearsalCheckpoints,
    new FakeLogger() as never,
  );
  const processor = new SchedulerQueueProcessor(
    new FakeLogger() as never,
    worker,
    commandRuntime,
    new FakePropositionLifecycleAutomationService() as PropositionLifecycleAutomationService,
    new FakeRequesterComparisonSetDeliveryAutomationService() as RequesterComparisonSetDeliveryAutomationService,
    alerts as never,
  );

  return { queue, alerts, commandRuntime, processor };
}

async function processQueuedCommands(input: ReturnType<typeof createQueuedRehearsal>) {
  const processed: Array<Record<string, string> | null> = [];
  for (const payload of input.queue.drain()) {
    processed.push(
      await input.processor.process({
        id: `cmd_${processed.length + 1}`,
        name: VALIDATION_CHAIN_COMMAND_JOB,
        data: payload,
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as never),
    );
  }
  return processed;
}

async function processQueuedSync(input: ReturnType<typeof createQueuedRehearsal>) {
  return input.processor.process({
    id: "sync_1",
    name: VALIDATION_CHAIN_SYNC_JOB,
    data: {},
    opts: { attempts: 3 },
    attemptsMade: 1,
  } as never);
}

function countDuplicateEvents(events: ValidationChainEvent[]): number {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = `${event.chainId}:${event.transactionHash}:${event.logIndex}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

describe("Validation chain phase five runtime", () => {
  it("guards operator and oracle commands with idempotent and state checks", async () => {
    const harness = createHarness();
    harness.markets[0].status = "pre_live";

    const createResult = await harness.operator.createMarket({
      propositionId: "prop_1",
    });
    assert.match(createResult.txHash, /^0x[a-f0-9]{64}$/);

    await assert.rejects(
      () =>
        harness.operator.createMarket({
          propositionId: "prop_1",
        }),
      /already exists|already projected/i,
    );

    await assert.rejects(
      () =>
        harness.oracle.resolveMarket({
          propositionId: "prop_1",
        }),
      /only be resolved from Frozen state/i,
    );

    assert.equal(
      harness.audits.some(
        (entry) =>
          entry.action === "validation_chain.create_market.submitted",
      ),
      true,
    );
  });

  it("ingests ordered events once and advances the cursor", async () => {
    const harness = createHarness();
    harness.markets[0].status = "live";

    await harness.operator.createMarket({ propositionId: "prop_1" });
    await harness.operator.openMarket({ propositionId: "prop_1" });
    await harness.contract.emitBetPlacedForTest({
      marketId: harness.markets[0].chainMarketId as string,
      propositionId: harness.markets[0].chainPropositionId as string,
      user: harness.bets[0].userId,
      selectedOption: 0,
      amount: harness.bets[0].stakeAmount,
    });
    harness.contract.mineEmptyBlock();

    const firstSync = await harness.worker.syncOnce();
    const secondSync = await harness.worker.syncOnce();

    assert.equal(firstSync.processedEvents, 3);
    assert.equal(secondSync.processedEvents, 0);
    assert.equal(harness.events.length, 3);
    assert.equal(
      harness.events.map((event) => event.eventName).join(","),
      "MarketCreated,MarketOpened,BetPlaced",
    );
    assert.equal(firstSync.streamKey, VALIDATION_CHAIN_STREAM_KEY);
    const checkpoints =
      await harness.rehearsalCheckpoints.listCheckpointsForProposition("prop_1");

    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.stepId === "local_bet_and_sync" &&
          checkpoint.reason === "validation_rehearsal.auto.bet_projection_synced" &&
          checkpoint.status === "complete",
      ),
      true,
    );
  });

  it("records proposition-scoped rehearsal checkpoints for queued create and open commands", async () => {
    const harness = createHarness({ includeCounterpartyBet: false });
    const rehearsal = createQueuedRehearsal(harness);
    harness.markets[0].status = "live";

    await rehearsal.commandRuntime.enqueueCreateOpenCommands({
      propositionId: "prop_1",
      actorUserId: "system",
      reason: "validation_chain.runtime.publish_live",
    });
    await processQueuedCommands(rehearsal);

    const checkpoints =
      await harness.rehearsalCheckpoints.listCheckpointsForProposition("prop_1");

    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.stepId === "publish_and_open" &&
          checkpoint.reason ===
            "validation_rehearsal.auto.create_market_submitted" &&
          checkpoint.status === "complete" &&
          checkpoint.recordedByUserId === "system" &&
          checkpoint.txHash !== null,
      ),
      true,
    );
    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.stepId === "publish_and_open" &&
          checkpoint.reason ===
            "validation_rehearsal.auto.open_market_submitted" &&
          checkpoint.status === "complete" &&
          checkpoint.recordedByUserId === "system" &&
          checkpoint.txHash !== null,
      ),
      true,
    );
  });

  it("records proposition-scoped rehearsal checkpoints for queued freeze and resolve commands", async () => {
    const harness = createHarness({ includeCounterpartyBet: false });
    const rehearsal = createQueuedRehearsal(harness);
    harness.markets[0].status = "live";

    await rehearsal.commandRuntime.enqueueCreateOpenCommands({
      propositionId: "prop_1",
      actorUserId: "system",
      reason: "validation_chain.runtime.publish_live",
    });
    await processQueuedCommands(rehearsal);
    await harness.contract.emitBetPlacedForTest({
      marketId: harness.markets[0].chainMarketId as string,
      propositionId: harness.markets[0].chainPropositionId as string,
      user: harness.bets[0].userId,
      selectedOption: harness.bets[0].selectedOption as 0 | 1,
      amount: harness.bets[0].stakeAmount,
    });

    harness.markets[0].status = "frozen_for_reveal";
    await rehearsal.commandRuntime.enqueueFreezeCommand({
      propositionId: "prop_1",
      actorUserId: "system",
      reason: "validation_chain.runtime.prepare_reveal",
    });
    await processQueuedCommands(rehearsal);

    await rehearsal.commandRuntime.enqueueResolveCommand({
      propositionId: "prop_1",
      actorUserId: "system",
      reason: "validation_chain.runtime.official_result",
    });
    await processQueuedCommands(rehearsal);

    const checkpoints =
      await harness.rehearsalCheckpoints.listCheckpointsForProposition("prop_1");

    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.stepId === "freeze_and_resolve" &&
          checkpoint.reason ===
            "validation_rehearsal.auto.freeze_market_submitted" &&
          checkpoint.status === "complete" &&
          checkpoint.recordedByUserId === "system" &&
          checkpoint.txHash !== null,
      ),
      true,
    );
    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.stepId === "freeze_and_resolve" &&
          checkpoint.reason ===
            "validation_rehearsal.auto.resolve_market_submitted" &&
          checkpoint.status === "complete" &&
          checkpoint.recordedByUserId === "system" &&
          checkpoint.txHash !== null,
      ),
      true,
    );
  });

  it("completes the minimal create -> open -> freeze -> resolve -> ingest happy path", async () => {
    const harness = createHarness();
    harness.markets[0].status = "live";

    const createResult = await harness.operator.createMarket({ propositionId: "prop_1" });
    await harness.operator.openMarket({ propositionId: "prop_1" });
    await harness.contract.emitBetPlacedForTest({
      marketId: createResult.chainMarketId,
      propositionId: createResult.chainPropositionId,
      user: harness.bets[0].userId,
      selectedOption: 0,
      amount: harness.bets[0].stakeAmount,
    });
    await harness.contract.emitBetPlacedForTest({
      marketId: createResult.chainMarketId,
      propositionId: createResult.chainPropositionId,
      user: harness.bets[1].userId,
      selectedOption: 1,
      amount: harness.bets[1].stakeAmount,
    });

    harness.markets[0].status = "frozen_for_reveal";
    await harness.operator.freezeMarket({ propositionId: "prop_1" });
    await harness.oracle.resolveMarket({ propositionId: "prop_1" });
    await harness.contract.emitClaimedForTest({
      marketId: createResult.chainMarketId,
      propositionId: createResult.chainPropositionId,
      user: harness.bets[0].userId,
      amount: "600",
    });
    harness.contract.mineEmptyBlock();

    const sync = await harness.worker.syncOnce();
    const cursorAfterFirstSync = harness.currentCursor();
    const betOneAfterFirstSync = clone(harness.bets[0]);
    const betTwoAfterFirstSync = clone(harness.bets[1]);
    const marketAfterFirstSync = clone(harness.markets[0]);
    const projectFailureCount = harness.audits.filter(
      (entry) => entry.action === "validation_chain.project.failed",
    ).length;

    const repeatedSync = await harness.worker.syncOnce();
    const cursorAfterRepeatedSync = harness.currentCursor();

    assert.equal(sync.processedEvents, 7);
    assert.equal(repeatedSync.processedEvents, 0);
    assert.equal(harness.events.length, 7);
    assert.equal(harness.markets[0].chainStatus, "resolved");
    assert.equal(harness.markets[0].resolutionTxHash !== null, true);
    assert.equal(harness.bets[0].settlementOutcome, "won");
    assert.equal(harness.bets[0].grossPayout, "600");
    assert.equal(harness.bets[0].claimed, true);
    assert.equal(harness.bets[1].settlementOutcome, "lost");
    assert.equal(harness.bets[1].grossPayout, "0");
    assert.equal(
      harness.audits.filter(
        (entry) => entry.action === "validation_chain.project.failed",
      ).length,
      projectFailureCount,
    );
    assert.deepEqual(harness.bets[0], betOneAfterFirstSync);
    assert.deepEqual(harness.bets[1], betTwoAfterFirstSync);
    assert.deepEqual(harness.markets[0], marketAfterFirstSync);
    assert.equal(
      cursorAfterRepeatedSync?.lastProcessedBlock,
      cursorAfterFirstSync?.lastProcessedBlock,
    );
    assert.equal(cursorAfterRepeatedSync?.syncStatus, "idle");
  });

  it("continues from the existing cursor after worker restart", async () => {
    const harness = createHarness();
    harness.markets[0].status = "live";

    const createResult = await harness.operator.createMarket({ propositionId: "prop_1" });
    await harness.operator.openMarket({ propositionId: "prop_1" });
    harness.contract.mineEmptyBlock();

    const firstSync = await harness.worker.syncOnce();
    const cursorAfterFirstSync = harness.currentCursor();
    const marketAfterFirstSync = clone(harness.markets[0]);

    const restartedWorker = harness.restartWorker();
    await harness.contract.emitBetPlacedForTest({
      marketId: createResult.chainMarketId,
      propositionId: createResult.chainPropositionId,
      user: harness.bets[0].userId,
      selectedOption: 0,
      amount: harness.bets[0].stakeAmount,
    });
    harness.contract.mineEmptyBlock();

    const restartedSync = await restartedWorker.syncOnce();
    const repeatedSync = await restartedWorker.syncOnce();
    const cursorAfterRestartedSync = harness.currentCursor();

    assert.equal(firstSync.processedEvents, 2);
    assert.equal(restartedSync.processedEvents, 1);
    assert.equal(repeatedSync.processedEvents, 0);
    assert.equal(harness.events.length, 3);
    assert.deepEqual(
      harness.events.map((event) => event.eventName),
      ["MarketCreated", "MarketOpened", "BetPlaced"],
    );
    assert.deepEqual(harness.markets[0], marketAfterFirstSync);
    assert.equal(harness.bets[0].chainSyncedAt !== null, true);
    assert.equal(
      cursorAfterRestartedSync?.lastProcessedBlock,
      (cursorAfterFirstSync?.lastProcessedBlock ?? 0) + 2,
    );
    assert.equal(cursorAfterRestartedSync?.syncStatus, "idle");
  });

  it("runs three staging-like happy paths through queued commands and restart-like sync", async () => {
    const harness = createHarness({ includeCounterpartyBet: false });
    const samples = [
      {
        ...appendValidationChainSample(
          {
            propositions: harness.propositions,
            markets: harness.markets,
            bets: harness.bets,
          },
          1,
        ),
        processedEvents: 0,
      },
      {
        ...appendValidationChainSample(
          {
            propositions: harness.propositions,
            markets: harness.markets,
            bets: harness.bets,
          },
          2,
        ),
        processedEvents: 0,
      },
      {
        ...appendValidationChainSample(
          {
            propositions: harness.propositions,
            markets: harness.markets,
            bets: harness.bets,
          },
          3,
        ),
        processedEvents: 0,
      },
    ];
    let rehearsal = createQueuedRehearsal(harness);
    const processedCommandJobs: Array<Record<string, string> | null> = [];
    const projectFailuresBefore = harness.audits.filter(
      (entry) => entry.action === "validation_chain.project.failed",
    ).length;
    const syncFailuresBefore = harness.audits.filter(
      (entry) => entry.action === "validation_chain.sync.failed",
    ).length;

    for (const [sampleIndex, sample] of samples.entries()) {
      sample.market.status = "live";
      await rehearsal.commandRuntime.enqueueCreateOpenCommands({
        propositionId: sample.proposition.id,
        actorUserId: "system",
        reason: "validation_chain.phase3b2.continuous_rehearsal",
      });
      processedCommandJobs.push(...(await processQueuedCommands(rehearsal)));

      await harness.contract.emitBetPlacedForTest({
        marketId: sample.market.chainMarketId as string,
        propositionId: sample.market.chainPropositionId as string,
        user: sample.bet.userId,
        selectedOption: sample.bet.selectedOption as 0 | 1,
        amount: sample.bet.stakeAmount,
      });

      sample.market.status = "frozen_for_reveal";
      await rehearsal.commandRuntime.enqueueFreezeCommand({
        propositionId: sample.proposition.id,
        actorUserId: "system",
        reason: "validation_chain.phase3b2.continuous_rehearsal",
      });
      processedCommandJobs.push(...(await processQueuedCommands(rehearsal)));

      await rehearsal.commandRuntime.enqueueResolveCommand({
        propositionId: sample.proposition.id,
        actorUserId: "system",
        reason: "validation_chain.phase3b2.continuous_rehearsal",
      });
      processedCommandJobs.push(...(await processQueuedCommands(rehearsal)));

      harness.contract.mineEmptyBlock();
      const syncResult = await processQueuedSync(rehearsal);
      sample.processedEvents = Number(syncResult?.processedEvents ?? 0);

      if (sampleIndex === 0) {
        const cursorAfterFirstSample = harness.currentCursor();
        const firstMarketProjection = clone(sample.market);
        const firstBetProjection = clone(sample.bet);
        rehearsal = createQueuedRehearsal(harness, harness.restartWorker());

        assert.equal(cursorAfterFirstSample?.syncStatus, "idle");
        assert.equal(firstMarketProjection.chainStatus, "resolved");
        assert.equal(firstBetProjection.settlementOutcome, "won");
      }
    }

    const cursorAfterContinuousRun = harness.currentCursor();
    const marketProjections = samples.map((sample) => clone(sample.market));
    const betProjections = samples.map((sample) => clone(sample.bet));
    const repeatedSync = await processQueuedSync(rehearsal);
    const cursorAfterRepeatedSync = harness.currentCursor();

    assert.deepEqual(
      samples.map((sample) => sample.processedEvents),
      [5, 5, 5],
    );
    assert.equal(Number(repeatedSync?.processedEvents ?? 0), 0);
    assert.equal(processedCommandJobs.length, 12);
    assert.equal(
      processedCommandJobs.every((job) => job?.processedAt && job.command),
      true,
    );
    assert.equal(harness.events.length, 15);
    assert.equal(countDuplicateEvents(harness.events), 0);
    assert.equal(cursorAfterRepeatedSync?.syncStatus, "idle");
    assert.equal(
      cursorAfterRepeatedSync?.lastProcessedBlock,
      cursorAfterContinuousRun?.lastProcessedBlock,
    );
    assert.equal(
      cursorAfterRepeatedSync?.lastProcessedTxHash,
      cursorAfterContinuousRun?.lastProcessedTxHash,
    );
    assert.equal(
      cursorAfterRepeatedSync?.lastProcessedLogIndex,
      cursorAfterContinuousRun?.lastProcessedLogIndex,
    );
    assert.equal(
      harness.audits.filter(
        (entry) => entry.action === "validation_chain.project.failed",
      ).length,
      projectFailuresBefore,
    );
    assert.equal(
      harness.audits.filter(
        (entry) => entry.action === "validation_chain.sync.failed",
      ).length,
      syncFailuresBefore,
    );

    for (const [index, sample] of samples.entries()) {
      assert.equal(sample.market.chainStatus, "resolved");
      assert.equal(sample.market.chainResultKind, "resolved");
      assert.equal(sample.market.chainWinningOption, 0);
      assert.match(sample.market.resolutionTxHash ?? "", /^0x[a-f0-9]{64}$/);
      assert.equal(sample.bet.status, "settled");
      assert.equal(sample.bet.settlementOutcome, "won");
      assert.equal(sample.bet.grossPayout, sample.bet.stakeAmount);
      assert.deepEqual(sample.market, marketProjections[index]);
      assert.deepEqual(sample.bet, betProjections[index]);
      assert.deepEqual(
        harness.events
          .filter((event) => event.marketChainId === sample.market.chainMarketId)
          .map((event) => event.eventName),
        [
          "MarketCreated",
          "MarketOpened",
          "BetPlaced",
          "MarketFrozen",
          "MarketResolved",
        ],
      );
    }
  });

  it("does not advance the cursor when projection fails before checkpointing", async () => {
    const harness = createHarness();
    harness.markets[0].status = "pre_live";

    await harness.operator.createMarket({ propositionId: "prop_1" });
    harness.markets[0].chainMarketId = ethers.constants.HashZero;
    harness.markets[0].chainPropositionId = ethers.constants.HashZero;
    harness.contract.mineEmptyBlock();

    await assert.rejects(
      () => harness.worker.syncOnce(),
      /projection target was not found/i,
    );

    const cursor = harness.currentCursor();
    assert.equal(cursor?.lastProcessedBlock, null);
    assert.equal(cursor?.lastProcessedTxHash, null);
    assert.equal(cursor?.lastProcessedLogIndex, null);
    assert.equal(cursor?.syncStatus, "error");
    assert.equal(
      harness.audits.some(
        (entry) => entry.action === "validation_chain.project.failed",
      ),
      true,
    );
    assert.equal(
      harness.audits.some(
        (entry) => entry.action === "validation_chain.sync.failed",
      ),
      true,
    );
  });

  it("projects BetPlaced by creating a local bet when sync sees the chain event before local confirm", async () => {
    const harness = createHarness({ includeCounterpartyBet: false });
    harness.markets[0].status = "live";
    harness.bets.splice(0, harness.bets.length);

    const createResult = await harness.operator.createMarket({ propositionId: "prop_1" });
    await harness.operator.openMarket({ propositionId: "prop_1" });
    await harness.contract.emitBetPlacedForTest({
      marketId: createResult.chainMarketId,
      propositionId: createResult.chainPropositionId,
      user: "0x00000000000000000000000000000000000000aa",
      selectedOption: 0,
      amount: "40",
    });
    harness.contract.mineEmptyBlock();

    const sync = await harness.worker.syncOnce();

    assert.equal(sync.processedEvents, 3);
    assert.equal(harness.bets.length, 1);
    assert.equal(harness.bets[0]?.userId, "0x00000000000000000000000000000000000000aa");
    assert.equal(harness.bets[0]?.selectedOption, 0);
    assert.equal(harness.bets[0]?.stakeAmount, "40");
    assert.equal(harness.bets[0]?.chainSyncedAt !== null, true);
    assert.equal(
      harness.audits.some(
        (entry) => entry.action === "validation_chain.project.failed",
      ),
      false,
    );
  });

  it("completes the cancel -> refund projection path", async () => {
    const harness = createHarness({ includeCounterpartyBet: false });
    const rehearsal = createQueuedRehearsal(harness);
    harness.markets[0].status = "live";
    const projectFailuresBefore = harness.audits.filter(
      (entry) => entry.action === "validation_chain.project.failed",
    ).length;
    const syncFailuresBefore = harness.audits.filter(
      (entry) => entry.action === "validation_chain.sync.failed",
    ).length;

    await rehearsal.commandRuntime.enqueueCreateOpenCommands({
      propositionId: "prop_1",
      actorUserId: "system",
      reason: "validation_chain.phase3b3.cancel_refund_rehearsal",
    });
    await processQueuedCommands(rehearsal);
    await harness.contract.emitBetPlacedForTest({
      marketId: harness.markets[0].chainMarketId as string,
      propositionId: harness.markets[0].chainPropositionId as string,
      user: harness.bets[0].userId,
      selectedOption: 0,
      amount: harness.bets[0].stakeAmount,
    });
    const cancelResult = await harness.operator.cancelMarket({
      propositionId: "prop_1",
      actorUserId: "ops_1",
      reasonCode: "ops_cancel",
      reason: "validation_chain.phase3b3.cancel_refund_rehearsal",
    });
    await harness.contract.emitRefundedForTest({
      marketId: cancelResult.chainMarketId,
      propositionId: cancelResult.chainPropositionId,
      user: harness.bets[0].userId,
      amount: harness.bets[0].stakeAmount,
    });
    harness.contract.mineEmptyBlock();

    const sync = await processQueuedSync(rehearsal);
    const cursorAfterSync = harness.currentCursor();
    const marketAfterSync = clone(harness.markets[0]);
    const betAfterSync = clone(harness.bets[0]);
    const repeatedSync = await processQueuedSync(rehearsal);
    const cursorAfterRepeatedSync = harness.currentCursor();

    assert.equal(Number(sync?.processedEvents ?? 0), 5);
    assert.equal(Number(repeatedSync?.processedEvents ?? 0), 0);
    assert.equal(harness.markets[0].chainStatus, "cancelled");
    assert.equal(harness.markets[0].cancelTxHash !== null, true);
    assert.equal(harness.bets[0].settlementOutcome, "refund");
    assert.equal(harness.bets[0].refundAmount, "400");
    assert.equal(harness.bets[0].claimed, true);
    assert.equal(harness.bets[0].refundTxHash !== null, true);
    assert.equal(countDuplicateEvents(harness.events), 0);
    assert.deepEqual(harness.markets[0], marketAfterSync);
    assert.deepEqual(harness.bets[0], betAfterSync);
    assert.equal(
      cursorAfterRepeatedSync?.lastProcessedBlock,
      cursorAfterSync?.lastProcessedBlock,
    );
    assert.equal(cursorAfterRepeatedSync?.syncStatus, "idle");
    assert.equal(
      harness.audits.filter(
        (entry) => entry.action === "validation_chain.project.failed",
      ).length,
      projectFailuresBefore,
    );
    assert.equal(
      harness.audits.filter(
        (entry) => entry.action === "validation_chain.sync.failed",
      ).length,
      syncFailuresBefore,
    );
    assert.equal(
      harness.audits.some(
        (entry) =>
          entry.action === "validation_chain.cancel_market.submitted",
      ),
      true,
    );
  });
});
