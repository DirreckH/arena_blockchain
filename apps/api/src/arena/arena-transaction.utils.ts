import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { ArenaDbClient } from "./prisma.types";

export async function withArenaTransaction<T>(
  prisma: PrismaService,
  db: ArenaDbClient | undefined,
  action: (tx: ArenaDbClient) => Promise<T>,
): Promise<T> {
  if (db) {
    return action(db);
  }

  return prisma.$transaction(async (tx) => action(tx));
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
