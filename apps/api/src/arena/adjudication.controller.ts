import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type {
  AdjudicationTaskViewModel,
  SubmitAdjudicationResponseResult,
} from "@arena/shared";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { SkipAdjudicationTaskDto } from "./dto/skip-adjudication-task.dto";
import { StartAdjudicationTaskDto } from "./dto/start-adjudication-task.dto";
import { SubmitTaskResponseDto } from "./dto/submit-task-response.dto";
import { AdjudicationViewService } from "./services/adjudication-view.service";
import { DispatchEngineService } from "./services/dispatch-engine.service";
import { EffectiveSampleCounterService } from "./services/effective-sample-counter.service";
import { ResponseService } from "./services/response.service";

@Controller("arena/adjudication")
export class ArenaAdjudicationController {
  constructor(
    private readonly adjudicationViews: AdjudicationViewService,
    private readonly dispatchEngine: DispatchEngineService,
    private readonly responses: ResponseService,
    private readonly counters: EffectiveSampleCounterService,
  ) {}

  @Get("tasks")
  listTasks(
    @Req() request: RequestWithUser,
  ) {
    return this.adjudicationViews.listTasksForUser(this.getUserId(request));
  }

  @Get("tasks/:taskId")
  getTask(
    @Param("taskId") taskId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.adjudicationViews.getTaskForUser(taskId, this.getUserId(request));
  }

  @Post("tasks/:taskId/start")
  async startTask(
    @Param("taskId") taskId: string,
    @Body() body: StartAdjudicationTaskDto,
    @Req() request: RequestWithUser,
  ): Promise<AdjudicationTaskViewModel> {
    const userId = this.getUserId(request);
    await this.dispatchEngine.startTask({
      taskId,
      userId,
      startedAt: body.startedAt,
    });

    return this.adjudicationViews.getTaskForUser(taskId, userId);
  }

  @Post("tasks/:taskId/skip")
  async skipTask(
    @Param("taskId") taskId: string,
    @Body() body: SkipAdjudicationTaskDto,
    @Req() request: RequestWithUser,
  ): Promise<AdjudicationTaskViewModel> {
    const userId = this.getUserId(request);
    await this.dispatchEngine.skipTask({
      taskId,
      userId,
      skippedAt: body.skippedAt,
      skipReason: body.skipReason,
    });

    return this.adjudicationViews.getTaskForUser(taskId, userId);
  }

  @Post("tasks/:taskId/responses")
  async submitResponse(
    @Param("taskId") taskId: string,
    @Body() body: SubmitTaskResponseDto,
    @Req() request: RequestWithUser,
  ): Promise<SubmitAdjudicationResponseResult> {
    const userId = this.getUserId(request);
    const response = await this.responses.submitResponse({
      propositionId: body.propositionId,
      taskId,
      userId,
      selectedOption: body.selectedOption as 0 | 1,
      confirmationOption: body.confirmationOption as 0 | 1,
      clientStartedAt: body.clientStartedAt,
      clientSubmittedAt: body.clientSubmittedAt,
      understandingAck: body.understandingAck,
      submittedAt: body.submittedAt,
    });
    await this.counters.rebuildCounterForProposition(body.propositionId);

    return {
      taskView: await this.adjudicationViews.getTaskForUser(taskId, userId),
      responseId: response.id,
      duplicateRetry: false,
      reviewRequested: true,
      counterRebuildRequired: true,
    };
  }

  private getUserId(request: RequestWithUser): string {
    return request.user?.sub as string;
  }
}
