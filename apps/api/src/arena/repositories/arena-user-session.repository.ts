import { Injectable } from "@nestjs/common";
import type { Prisma, UserSession } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class ArenaUserSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.UserSessionUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserSession> {
    return db.userSession.create({ data });
  }
}
