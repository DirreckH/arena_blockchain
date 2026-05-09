import { Injectable } from "@nestjs/common";
import type { Prisma, ValidationChainEvent } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";
import type {
  ValidationChainCursorRangeQuery,
  ValidationChainEventInsertResult,
  ValidationChainEventRecordInput,
} from "../validation-chain/validation-chain.types";

@Injectable()
export class ValidationChainEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertIfAbsent(
    data: ValidationChainEventRecordInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainEventInsertResult> {
    const createData: Prisma.ValidationChainEventUncheckedCreateInput = {
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
      payloadJson: data.payloadJson,
      processedAt: data.processedAt ?? new Date(),
    };

    const eventDelegate = db.validationChainEvent as typeof db.validationChainEvent & {
      createMany?: (input: {
        data: Prisma.ValidationChainEventUncheckedCreateInput[];
        skipDuplicates: boolean;
      }) => Promise<{ count: number }>;
    };
    const result =
      typeof eventDelegate.createMany === "function"
        ? await eventDelegate.createMany({
            data: [createData],
            skipDuplicates: true,
          })
        : await this.createForInMemoryDelegate(createData, db);
    const event = await db.validationChainEvent.findUnique({
      where: {
        chainId_transactionHash_logIndex: {
          chainId: data.chainId,
          transactionHash: data.transactionHash,
          logIndex: data.logIndex,
        },
      },
    });

    if (!event) {
      throw new Error(
        `Validation chain event was not persisted for tx ${data.transactionHash} log ${data.logIndex}`,
      );
    }

    return { event, inserted: result.count > 0 };
  }

  private async createForInMemoryDelegate(
    createData: Prisma.ValidationChainEventUncheckedCreateInput,
    db: ArenaDbClient,
  ): Promise<{ count: number }> {
    const existing = await db.validationChainEvent.findUnique({
      where: {
        chainId_transactionHash_logIndex: {
          chainId: createData.chainId,
          transactionHash: createData.transactionHash,
          logIndex: createData.logIndex,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return { count: 0 };
    }

    await db.validationChainEvent.create({ data: createData });
    return { count: 1 };
  }

  async saveEvent(
    data: ValidationChainEventRecordInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainEventInsertResult> {
    return this.insertIfAbsent(data, db);
  }

  async existsByChainTxLog(
    chainId: number,
    transactionHash: string,
    logIndex: number,
    db: ArenaDbClient = this.prisma,
  ): Promise<boolean> {
    const event = await db.validationChainEvent.findUnique({
      where: {
        chainId_transactionHash_logIndex: {
          chainId,
          transactionHash,
          logIndex,
        },
      },
      select: { id: true },
    });

    return event !== null;
  }

  async findByCursorRange(
    query: ValidationChainCursorRangeQuery,
    db: ArenaDbClient = this.prisma,
  ): Promise<ValidationChainEvent[]> {
    return db.validationChainEvent.findMany({
      where: {
        chainId: query.chainId,
        contractAddress: query.contractAddress,
        blockNumber: {
          gte: query.fromBlock,
          lte: query.toBlock,
        },
      },
      orderBy: [
        { blockNumber: "asc" },
        { transactionIndex: "asc" },
        { logIndex: "asc" },
      ],
      take: query.limit,
    });
  }

  async listIdsByChainReferences(
    input: {
      propositionChainId?: string | null;
      marketChainId?: string | null;
    },
    db: ArenaDbClient = this.prisma,
  ): Promise<string[]> {
    const orClauses: Prisma.ValidationChainEventWhereInput[] = [];

    if (input.propositionChainId) {
      orClauses.push({
        propositionChainId: input.propositionChainId,
      });
    }

    if (input.marketChainId) {
      orClauses.push({
        marketChainId: input.marketChainId,
      });
    }

    if (orClauses.length === 0) {
      return [];
    }

    const events = await db.validationChainEvent.findMany({
      where: {
        OR: orClauses,
      },
      select: {
        id: true,
      },
    });

    return events.map((event) => event.id);
  }
}
