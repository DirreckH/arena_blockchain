import type { Prisma } from "@prisma/client";

import type { PrismaService } from "../database/prisma.service";

export type ArenaDbClient = PrismaService | Prisma.TransactionClient;
