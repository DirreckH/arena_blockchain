import { Injectable } from "@nestjs/common";
import type { Prisma, UserTag } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class UserTagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserTag[]> {
    return db.userTag.findMany({
      where: { userId },
      orderBy: [
        { expiresAt: "asc" },
        { updatedAt: "desc" },
      ],
    });
  }

  async listCurrentByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserTag[]> {
    return db.userTag.findMany({
      where: {
        userId,
        expiresAt: null,
      },
      orderBy: [
        { tagType: "asc" },
        { confidenceScore: "desc" },
        { tagKey: "asc" },
      ],
    });
  }

  async findByUserIdAndTagKey(
    userId: string,
    tagKey: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserTag | null> {
    return db.userTag.findUnique({
      where: {
        userId_tagKey: {
          userId,
          tagKey,
        },
      },
    });
  }

  async upsertByUserIdAndTagKey(
    userId: string,
    tagKey: string,
    create: Prisma.UserTagUncheckedCreateInput,
    update: Prisma.UserTagUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserTag> {
    return db.userTag.upsert({
      where: {
        userId_tagKey: {
          userId,
          tagKey,
        },
      },
      create,
      update,
    });
  }

  async update(
    id: string,
    data: Prisma.UserTagUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserTag> {
    return db.userTag.update({
      where: { id },
      data,
    });
  }
}
