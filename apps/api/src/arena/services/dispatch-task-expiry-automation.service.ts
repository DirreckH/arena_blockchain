import { Injectable } from "@nestjs/common";

import { toDate } from "../arena.utils";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { DispatchEngineService } from "./dispatch-engine.service";

@Injectable()
export class DispatchTaskExpiryAutomationService {
  constructor(
    private readonly tasks: DispatchTaskRepository,
    private readonly dispatchEngine: DispatchEngineService,
  ) {}

  async expireDueTasks(input: { now?: string } = {}) {
    const now = input.now ? toDate(input.now) : new Date();
    const dueTasks = await this.tasks.listExpiredTasks(now);
    const taskIds: string[] = [];

    for (const task of dueTasks) {
      await this.dispatchEngine.expireTask({
        taskId: task.id,
        expiredAt: now.toISOString(),
        expiryReason: "ttl_elapsed",
      });
      taskIds.push(task.id);
    }

    return {
      processedAt: now.toISOString(),
      processedCount: taskIds.length,
      taskIds,
    };
  }
}
