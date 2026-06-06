import { Injectable } from "@nestjs/common";
import type { InternalAuditEvent, Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";
import type { InternalAuditEventListFilters } from "../internal-ops.types";

const buildWhere = (
  filters: InternalAuditEventListFilters,
): Prisma.InternalAuditEventWhereInput => {
  const search = filters.search?.trim();

  return {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { entityType: { contains: search, mode: "insensitive" } },
            { entityId: { contains: search, mode: "insensitive" } },
            { actorUserId: { contains: search, mode: "insensitive" } },
            { reason: { contains: search, mode: "insensitive" } },
            { note: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
};

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

  async list(
    filters: InternalAuditEventListFilters,
    db: ArenaDbClient = this.prisma,
  ): Promise<InternalAuditEvent[]> {
    return db.internalAuditEvent.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: filters.sortDirection ?? "desc" },
      take: filters.limit,
      skip: filters.offset,
    });
  }

  async count(
    filters: InternalAuditEventListFilters,
    db: ArenaDbClient = this.prisma,
  ): Promise<number> {
    return db.internalAuditEvent.count({
      where: buildWhere(filters),
    });
  }
}
