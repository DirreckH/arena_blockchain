import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { ArenaDbClient } from "./prisma.types";

const DEFAULT_ARENA_TRANSACTION_MAX_WAIT_MS = 5_000;
const DEFAULT_ARENA_TRANSACTION_TIMEOUT_MS = 15_000;

export interface ArenaTransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWaitMs?: number;
  timeoutMs?: number;
}

export async function withArenaTransaction<T>(
  prisma: PrismaService,
  db: ArenaDbClient | undefined,
  action: (tx: ArenaDbClient) => Promise<T>,
  options: ArenaTransactionOptions = {},
): Promise<T> {
  if (db) {
    return action(db);
  }

  const transactionOptions = {
    maxWait: options.maxWaitMs ?? DEFAULT_ARENA_TRANSACTION_MAX_WAIT_MS,
    timeout: options.timeoutMs ?? DEFAULT_ARENA_TRANSACTION_TIMEOUT_MS,
    ...(options.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : {}),
  };

  return prisma.$transaction(
    async (tx) => action(tx),
    transactionOptions,
  );
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  ) {
    return true;
  }

  return false;
}
