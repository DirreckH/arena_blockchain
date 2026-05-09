import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ValidationChainCursor,
  ValidationChainEvent,
} from "@prisma/client";

import { ValidationChainCursorRepository } from "../../src/arena/repositories/validation-chain-cursor.repository";
import { ValidationChainEventRepository } from "../../src/arena/repositories/validation-chain-event.repository";
import type { PrismaService } from "../../src/database/prisma.service";

type EventCreateInput = Omit<ValidationChainEvent, "id"> & { id?: string };
type CursorCreateInput = Omit<
  ValidationChainCursor,
  "createdAt" | "updatedAt"
> & {
  createdAt?: Date;
  updatedAt?: Date;
};

const clone = <T>(value: T): T => structuredClone(value);

class FakeValidationChainEventDelegate {
  private readonly events: ValidationChainEvent[] = [];

  async createMany({
    data,
    skipDuplicates,
  }: {
    data: EventCreateInput[];
    skipDuplicates: boolean;
  }): Promise<{ count: number }> {
    let count = 0;
    for (const event of data) {
      const duplicate = this.events.some(
        (item) =>
          item.chainId === event.chainId &&
          item.transactionHash === event.transactionHash &&
          item.logIndex === event.logIndex,
      );
      if (duplicate && skipDuplicates) {
        continue;
      }

      await this.create({ data: event });
      count += 1;
    }

    return { count };
  }

  async create({ data }: { data: EventCreateInput }): Promise<ValidationChainEvent> {
    const duplicate = this.events.find(
      (item) =>
        item.chainId === data.chainId &&
        item.transactionHash === data.transactionHash &&
        item.logIndex === data.logIndex,
    );

    if (duplicate) {
      throw { code: "P2002" };
    }

    const event: ValidationChainEvent = {
      id: data.id ?? `event_${this.events.length + 1}`,
      chainId: data.chainId,
      contractAddress: data.contractAddress,
      blockNumber: data.blockNumber,
      blockHash: data.blockHash,
      transactionHash: data.transactionHash,
      transactionIndex: data.transactionIndex,
      logIndex: data.logIndex,
      eventName: data.eventName,
      marketChainId: data.marketChainId ?? null,
      propositionChainId: data.propositionChainId ?? null,
      payloadJson: clone(data.payloadJson),
      processedAt: data.processedAt ?? new Date(),
    };

    this.events.push(event);
    return clone(event);
  }

  async findUnique({
    where,
    select,
  }: {
    where: {
      chainId_transactionHash_logIndex: {
        chainId: number;
        transactionHash: string;
        logIndex: number;
      };
    };
    select?: { id: true };
  }): Promise<ValidationChainEvent | { id: string } | null> {
    const event =
      this.events.find(
        (item) =>
          item.chainId === where.chainId_transactionHash_logIndex.chainId &&
          item.transactionHash ===
            where.chainId_transactionHash_logIndex.transactionHash &&
          item.logIndex === where.chainId_transactionHash_logIndex.logIndex,
      ) ?? null;

    if (!event) {
      return null;
    }

    if (select?.id) {
      return { id: event.id };
    }

    return clone(event);
  }

  async findMany({
    where,
    take,
  }: {
    where: {
      chainId: number;
      contractAddress: string;
      blockNumber: { gte: number; lte: number };
    };
    orderBy: Array<Record<string, "asc" | "desc">>;
    take?: number;
  }): Promise<ValidationChainEvent[]> {
    const filtered = this.events
      .filter(
        (item) =>
          item.chainId === where.chainId &&
          item.contractAddress === where.contractAddress &&
          item.blockNumber >= where.blockNumber.gte &&
          item.blockNumber <= where.blockNumber.lte,
      )
      .sort((left, right) => {
        if (left.blockNumber !== right.blockNumber) {
          return left.blockNumber - right.blockNumber;
        }

        if (left.transactionIndex !== right.transactionIndex) {
          return left.transactionIndex - right.transactionIndex;
        }

        return left.logIndex - right.logIndex;
      });

    return clone(filtered.slice(0, take ?? filtered.length));
  }

  countRows(): number {
    return this.events.length;
  }
}

class FakeValidationChainCursorDelegate {
  private readonly cursors = new Map<string, ValidationChainCursor>();

  async findUnique({
    where,
  }: {
    where: { streamKey: string };
  }): Promise<ValidationChainCursor | null> {
    return clone(this.cursors.get(where.streamKey) ?? null);
  }

  async upsert({
    where,
    create,
    update,
  }: {
    where: { streamKey: string };
    create: CursorCreateInput;
    update: Partial<CursorCreateInput>;
  }): Promise<ValidationChainCursor> {
    const existing = this.cursors.get(where.streamKey);

    if (existing) {
      const nextValue: ValidationChainCursor = {
        ...existing,
        ...clone(update),
        updatedAt: new Date(),
      };
      this.cursors.set(where.streamKey, nextValue);
      return clone(nextValue);
    }

    const created: ValidationChainCursor = {
      ...clone(create),
      createdAt: create.createdAt ?? new Date(),
      updatedAt: create.updatedAt ?? new Date(),
    };
    this.cursors.set(where.streamKey, created);
    return clone(created);
  }

  async update({
    where,
    data,
  }: {
    where: { streamKey: string };
    data: Partial<ValidationChainCursor>;
  }): Promise<ValidationChainCursor> {
    const current = this.cursors.get(where.streamKey);
    if (!current) {
      throw new Error(`Cursor ${where.streamKey} not found`);
    }

    const nextValue: ValidationChainCursor = {
      ...current,
      ...clone(data),
      updatedAt: new Date(),
    };
    this.cursors.set(where.streamKey, nextValue);
    return clone(nextValue);
  }
}

function createRepositoryHarness() {
  const eventDelegate = new FakeValidationChainEventDelegate();
  const cursorDelegate = new FakeValidationChainCursorDelegate();
  const prisma = {
    validationChainEvent: eventDelegate,
    validationChainCursor: cursorDelegate,
  } as unknown as PrismaService;

  return {
    events: new ValidationChainEventRepository(prisma),
    cursors: new ValidationChainCursorRepository(prisma),
    eventDelegate,
  };
}

function createEvent(overrides: Partial<EventCreateInput> = {}): EventCreateInput {
  return {
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000000002",
    blockNumber: 100,
    blockHash: "0xblock",
    transactionHash: "0xtx",
    transactionIndex: 0,
    logIndex: 0,
    eventName: "MarketCreated",
    marketChainId: "0xmarket",
    propositionChainId: "0xprop",
    payloadJson: { value: "ok" },
    processedAt: new Date("2026-04-23T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ValidationChain repositories", () => {
  it("deduplicates events by chain id, transaction hash, and log index", async () => {
    const harness = createRepositoryHarness();

    const first = await harness.events.insertIfAbsent(createEvent());
    const second = await harness.events.insertIfAbsent(
      createEvent({ eventName: "MarketOpened" }),
    );

    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(first.event.id, second.event.id);
    assert.equal(
      await harness.events.existsByChainTxLog(1337, "0xtx", 0),
      true,
    );
  });

  it("skips duplicate events without blocking later distinct events", async () => {
    const harness = createRepositoryHarness();

    const first = await harness.events.insertIfAbsent(createEvent());
    const duplicate = await harness.events.insertIfAbsent(
      createEvent({ eventName: "MarketOpened" }),
    );
    const next = await harness.events.insertIfAbsent(
      createEvent({
        transactionHash: "0xtx-next",
        logIndex: 1,
        eventName: "MarketFrozen",
      }),
    );

    assert.equal(first.inserted, true);
    assert.equal(duplicate.inserted, false);
    assert.equal(next.inserted, true);
    assert.equal(harness.eventDelegate.countRows(), 2);
  });

  it("returns cursor range queries in chain processing order", async () => {
    const harness = createRepositoryHarness();

    await harness.events.insertIfAbsent(
      createEvent({
        blockNumber: 101,
        transactionHash: "0xtx-2",
        transactionIndex: 1,
        logIndex: 3,
      }),
    );
    await harness.events.insertIfAbsent(
      createEvent({
        blockNumber: 100,
        transactionHash: "0xtx-1",
        transactionIndex: 0,
        logIndex: 5,
      }),
    );
    await harness.events.insertIfAbsent(
      createEvent({
        blockNumber: 100,
        transactionHash: "0xtx-1",
        transactionIndex: 0,
        logIndex: 1,
      }),
    );

    const events = await harness.events.findByCursorRange({
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      fromBlock: 100,
      toBlock: 101,
    });

    assert.deepEqual(
      events.map((event) => [event.blockNumber, event.transactionIndex, event.logIndex]),
      [
        [100, 0, 1],
        [100, 0, 5],
        [101, 1, 3],
      ],
    );
  });

  it("upserts and updates cursor checkpoints", async () => {
    const harness = createRepositoryHarness();

    const created = await harness.cursors.upsertCursor({
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      syncStatus: "idle",
    });

    const processed = await harness.cursors.updateProcessedCheckpoint(
      "validation_market_main",
      {
        lastProcessedBlock: 120,
        lastProcessedTxHash: "0xprocessed",
        lastProcessedLogIndex: 7,
        syncStatus: "syncing",
      },
    );

    const finalized = await harness.cursors.updateFinalizedBlock(
      "validation_market_main",
      118,
      "idle",
    );

    assert.equal(created.streamKey, "validation_market_main");
    assert.equal(processed.lastProcessedBlock, 120);
    assert.equal(processed.lastProcessedTxHash, "0xprocessed");
    assert.equal(processed.lastProcessedLogIndex, 7);
    assert.equal(finalized.lastFinalizedBlock, 118);
    assert.equal(finalized.syncStatus, "idle");
    assert.deepEqual(
      await harness.cursors.getCursor("validation_market_main"),
      finalized,
    );
  });

  it("does not clear existing cursor checkpoint fields on status-only upsert", async () => {
    const harness = createRepositoryHarness();

    await harness.cursors.upsertCursor({
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      lastProcessedBlock: 120,
      lastProcessedTxHash: "0xprocessed",
      lastProcessedLogIndex: 7,
      lastFinalizedBlock: 118,
      syncStatus: "idle",
    });

    const updated = await harness.cursors.upsertCursor({
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      syncStatus: "syncing",
    });

    assert.equal(updated.lastProcessedBlock, 120);
    assert.equal(updated.lastProcessedTxHash, "0xprocessed");
    assert.equal(updated.lastProcessedLogIndex, 7);
    assert.equal(updated.lastFinalizedBlock, 118);
    assert.equal(updated.syncStatus, "syncing");
  });
});
