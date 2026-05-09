import { Injectable } from "@nestjs/common";
import type {
  DispatchTask,
  DispatchTaskStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

const ACTIVE_DISPATCH_TASK_STATUSES: readonly DispatchTaskStatus[] = [
  "assigned",
  "started",
] as const;

@Injectable()
export class DispatchTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.DispatchTaskUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask> {
    return db.dispatchTask.create({ data });
  }

  async findById(
    taskId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask | null> {
    return db.dispatchTask.findUnique({ where: { id: taskId } });
  }

  async findActiveByPropositionAndUser(
    propositionId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask | null> {
    return db.dispatchTask.findFirst({
      where: {
        propositionId,
        userId,
        status: { in: [...ACTIVE_DISPATCH_TASK_STATUSES] },
      },
      orderBy: { assignedAt: "desc" },
    });
  }

  async listByUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask[]> {
    return db.dispatchTask.findMany({
      where: { userId },
      orderBy: { assignedAt: "desc" },
    });
  }

  async listByProposition(
    propositionId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask[]> {
    return db.dispatchTask.findMany({
      where: { propositionId },
      orderBy: { assignedAt: "asc" },
    });
  }

  async listByPropositionAndUser(
    propositionId: string,
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask[]> {
    return db.dispatchTask.findMany({
      where: { propositionId, userId },
      orderBy: { assignedAt: "desc" },
    });
  }

  async update(
    taskId: string,
    data: Prisma.DispatchTaskUncheckedUpdateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask> {
    return db.dispatchTask.update({
      where: { id: taskId },
      data,
    });
  }

  async updateStatus(
    taskId: string,
    status: DispatchTaskStatus,
    data: Omit<Prisma.DispatchTaskUncheckedUpdateInput, "status"> = {},
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask> {
    return this.update(
      taskId,
      {
        ...data,
        status,
      },
      db,
    );
  }

  async listExpiredTasks(
    now: Date,
    db: ArenaDbClient = this.prisma,
  ): Promise<DispatchTask[]> {
    return db.dispatchTask.findMany({
      where: {
        status: { in: [...ACTIVE_DISPATCH_TASK_STATUSES] },
        expiresAt: { lte: now },
      },
      orderBy: { expiresAt: "asc" },
    });
  }
}
