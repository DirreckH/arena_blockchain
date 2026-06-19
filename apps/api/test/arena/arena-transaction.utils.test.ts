import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";

import type { ArenaDbClient } from "../../src/arena/prisma.types";
import { withArenaTransaction } from "../../src/arena/arena-transaction.utils";

describe("withArenaTransaction", () => {
  it("reuses an existing arena db client without opening a new transaction", async () => {
    let openedTransaction = false;
    const prisma = {
      async $transaction() {
        openedTransaction = true;
        throw new Error("should not open a nested transaction");
      },
    } as const;
    const existingDb = { marker: "existing-db" } as unknown as ArenaDbClient;

    const result = await withArenaTransaction(
      prisma as never,
      existingDb,
      async (tx) => {
        assert.equal(tx, existingDb);
        return "ok";
      },
    );

    assert.equal(result, "ok");
    assert.equal(openedTransaction, false);
  });

  it("applies stable default interactive transaction settings for top-level arena work", async () => {
    let capturedOptions: Record<string, unknown> | null = null;
    const tx = { marker: "top-level-tx" } as unknown as ArenaDbClient;
    const prisma = {
      async $transaction<T>(
        action: (db: ArenaDbClient) => Promise<T>,
        options?: Record<string, unknown>,
      ): Promise<T> {
        capturedOptions = options ?? null;
        return action(tx);
      },
    } as const;

    const result = await withArenaTransaction(
      prisma as never,
      undefined,
      async (db) => {
        assert.equal(db, tx);
        return "done";
      },
    );

    assert.equal(result, "done");
    assert.deepEqual(capturedOptions, {
      maxWait: 5_000,
      timeout: 15_000,
    });
  });

  it("allows arena flows to override transaction settings when a slower path needs headroom", async () => {
    let capturedOptions: Record<string, unknown> | null = null;
    const prisma = {
      async $transaction<T>(
        action: (db: ArenaDbClient) => Promise<T>,
        options?: Record<string, unknown>,
      ): Promise<T> {
        capturedOptions = options ?? null;
        return action({ marker: "override-tx" } as unknown as ArenaDbClient);
      },
    } as const;

    await withArenaTransaction(
      prisma as never,
      undefined,
      async () => undefined,
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWaitMs: 7_000,
        timeoutMs: 20_000,
      },
    );

    assert.deepEqual(capturedOptions, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 7_000,
      timeout: 20_000,
    });
  });
});
