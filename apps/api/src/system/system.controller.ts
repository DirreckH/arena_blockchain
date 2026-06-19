import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";

import {
  SystemRole,
  type ChainSnapshot,
  type EnqueuedJobSnapshot,
  type QueueFailedJobRequeueResultSnapshot,
  type QueueOverviewSnapshot,
} from "@arena/shared";

import { BlockchainService } from "../blockchain/blockchain.service";
import { ArenaRateLimit } from "../common/decorators/arena-rate-limit.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { AppQueueService } from "../queue/queue.service";
import { DemoFailureJobDto } from "./dto/demo-failure-job.dto";

@Controller("system")
export class SystemController {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly queueService: AppQueueService,
  ) {}

  @Public()
  @Get("chain")
  getChainSnapshot(): Promise<ChainSnapshot> {
    return this.blockchainService.getChainSnapshot();
  }

  @Post("jobs/ping")
  @ArenaRateLimit("internal")
  enqueuePing(@Req() request: RequestWithUser): Promise<EnqueuedJobSnapshot> {
    return this.queueService.enqueueSystemPing({
      requestedBy: request.user?.walletAddress,
      requestedAt: new Date().toISOString(),
      requestId: request.requestId,
      traceId: request.traceId,
    });
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("jobs/demo-failure")
  @ArenaRateLimit("internal")
  enqueueDemoFailure(
    @Req() request: RequestWithUser,
    @Body() body: DemoFailureJobDto,
  ): Promise<EnqueuedJobSnapshot> {
    return this.queueService.enqueueSystemFailureDemo({
      requestedBy: request.user?.walletAddress,
      requestedAt: new Date().toISOString(),
      requestId: request.requestId,
      traceId: request.traceId,
      forcePermanentFailure: body.forcePermanentFailure ?? false,
      failuresBeforeSuccess: body.failuresBeforeSuccess ?? 0,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Get("queues/overview")
  @ArenaRateLimit("internal")
  getQueueOverview(): Promise<QueueOverviewSnapshot> {
    return this.queueService.getQueueOverview();
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("queues/:queueName/requeue-failed")
  @ArenaRateLimit("internal")
  requeueFailedJobs(
    @Param("queueName") queueName: string,
  ): Promise<QueueFailedJobRequeueResultSnapshot> {
    return this.queueService.requeueFailedJobs(queueName);
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Get("admin/ping")
  @ArenaRateLimit("internal")
  getAdminPing(@Req() request: RequestWithUser) {
    return {
      status: "ok" as const,
      timestamp: new Date().toISOString(),
      walletAddress: request.user?.walletAddress,
      roles: request.user?.roles ?? [],
    };
  }
}
