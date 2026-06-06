import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import { InternalAuditEventRepository } from "../repositories/internal-audit-event.repository";
import type {
  InternalAuditEventListFilters,
  InternalAuditEventListPageViewModel,
  InternalAuditEventViewModel,
} from "../internal-ops.types";

const toIso = (value: Date): string => value.toISOString();
const DEFAULT_OPS_PAGE_LIMIT = 25;
const MAX_OPS_PAGE_LIMIT = 100;

const clampLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPS_PAGE_LIMIT;
  }

  return Math.min(
    MAX_OPS_PAGE_LIMIT,
    Math.max(1, Math.trunc(value ?? DEFAULT_OPS_PAGE_LIMIT)),
  );
};

const clampOffset = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value ?? 0));
};

@Injectable()
export class InternalAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly audits: InternalAuditEventRepository,
  ) {}

  async record(
    input: {
      entityType: string;
      entityId: string;
      action: string;
      actorUserId?: string | null;
      reason: string;
      note?: string;
      metadata?: Prisma.InputJsonValue;
      createdAt?: Date;
    },
    db?: ArenaDbClient,
  ): Promise<InternalAuditEventViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const event = await this.audits.create(
        {
          id: this.ids.next("internal_audit"),
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          reason: input.reason,
          note: input.note ?? null,
          metadataJson: input.metadata,
          createdAt: input.createdAt,
        },
        tx,
      );

      return this.toViewModel(event);
    });
  }

  async listByEntity(
    entityType: string,
    entityId: string,
    db?: ArenaDbClient,
  ): Promise<InternalAuditEventViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      (await this.audits.listByEntity(entityType, entityId, tx)).map((event) =>
        this.toViewModel(event),
      ),
    );
  }

  async listByEntityIds(
    entityType: string,
    entityIds: string[],
    db?: ArenaDbClient,
  ): Promise<InternalAuditEventViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      (await this.audits.listByEntityIds(entityType, entityIds, tx)).map((event) =>
        this.toViewModel(event),
      ),
    );
  }

  async listEvents(
    filters: InternalAuditEventListFilters,
    db?: ArenaDbClient,
  ): Promise<InternalAuditEventListPageViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const limit = clampLimit(filters.limit);
      const offset = clampOffset(filters.offset);
      const normalizedFilters = {
        ...filters,
        search: filters.search?.trim() || undefined,
        limit,
        offset,
      } satisfies InternalAuditEventListFilters;

      const [items, totalCount] = await Promise.all([
        this.audits.list(normalizedFilters, tx),
        this.audits.count(normalizedFilters, tx),
      ]);

      return {
        items: items.map((event) => this.toViewModel(event)),
        totalCount,
        limit,
        offset,
      };
    });
  }

  private toViewModel(event: {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string | null;
    reason: string;
    note: string | null;
    metadataJson: unknown;
    createdAt: Date;
  }): InternalAuditEventViewModel {
    return {
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorUserId: event.actorUserId,
      reason: event.reason,
      note: event.note,
      metadata: event.metadataJson as InternalAuditEventViewModel["metadata"],
      createdAt: toIso(event.createdAt),
    };
  }
}
