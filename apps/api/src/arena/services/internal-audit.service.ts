import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import { InternalAuditEventRepository } from "../repositories/internal-audit-event.repository";
import type { InternalAuditEventViewModel } from "../internal-ops.types";

const toIso = (value: Date): string => value.toISOString();

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
