import { Injectable } from "@nestjs/common";
import type { Prisma, SystemKeyValue } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class SystemKeyValueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(
    key: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<SystemKeyValue | null> {
    return db.systemKeyValue.findFirst({
      where: {
        key,
        deletedAt: null,
      },
    });
  }

  async upsertByKey(
    key: string,
    create: Prisma.SystemKeyValueUncheckedCreateInput,
    update: Prisma.SystemKeyValueUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<SystemKeyValue> {
    const existing = await this.findByKey(key, db);

    if (existing) {
      return db.systemKeyValue.update({
        where: { id: existing.id },
        data: {
          ...update,
          deletedAt: null,
        },
      });
    }

    return db.systemKeyValue.create({
      data: create,
    });
  }

  async listByKeyPrefix(
    keyPrefix: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<SystemKeyValue[]> {
    return db.systemKeyValue.findMany({
      where: {
        key: {
          startsWith: keyPrefix,
        },
        deletedAt: null,
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  async softDeleteByKey(
    key: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<SystemKeyValue | null> {
    const existing = await this.findByKey(key, db);
    if (!existing) {
      return null;
    }

    return db.systemKeyValue.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
