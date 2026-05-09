import { Injectable } from "@nestjs/common";
import type { Prisma, UserReputation } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class UserReputationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserReputation | null> {
    return db.userReputation.findUnique({
      where: { userId },
    });
  }

  async upsertByUserId(
    userId: string,
    create: Prisma.UserReputationUncheckedCreateInput,
    update: Prisma.UserReputationUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserReputation> {
    return db.userReputation.upsert({
      where: { userId },
      create,
      update,
    });
  }
}
