import { Injectable } from "@nestjs/common";
import type { InternalAuditEvent, Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class InternalAuditEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.InternalAuditEventUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<InternalAuditEvent> {
    return db.internalAuditEvent.create({ data });
  }

  async listByEntity(
    entityType: string,
    entityId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<InternalAuditEvent[]> {
    return db.internalAuditEvent.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listByEntityIds(
    entityType: string,
    entityIds: string[],
    db: ArenaDbClient = this.prisma,
  ): Promise<InternalAuditEvent[]> {
    if (entityIds.length === 0) {
      return [];
    }

    return db.internalAuditEvent.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
