import { Injectable } from "@nestjs/common";
import type {
  EffectiveSampleCounter,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class EffectiveSampleCounterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPropositionId(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<EffectiveSampleCounter | null> {
    return db.effectiveSampleCounter.findUnique({
      where: { propositionId },
    });
  }

  async createIfMissing(
    propositionId: string,
    id: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<EffectiveSampleCounter> {
    return db.effectiveSampleCounter.upsert({
      where: { propositionId },
      update: {},
      create: {
        id,
        propositionId,
      },
    });
  }

  async upsertSnapshot(
    propositionId: string,
    id: string,
    snapshot: Pick<
      Prisma.EffectiveSampleCounterUncheckedCreateInput,
      | "totalResponses"
      | "reviewedResponses"
      | "validCount"
      | "partialValidCount"
      | "invalidCount"
    >,
    db: ArenaDbClient = this.prisma,
  ): Promise<EffectiveSampleCounter> {
    return db.effectiveSampleCounter.upsert({
      where: { propositionId },
      update: snapshot,
      create: {
        id,
        propositionId,
        ...snapshot,
      },
    });
  }
}
