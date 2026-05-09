import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { CreatePropositionDraftDto } from "./dto/create-proposition-draft.dto";
import { ListPropositionDraftsQueryDto } from "./dto/list-proposition-drafts-query.dto";
import { SubmitPropositionDraftDto } from "./dto/submit-proposition-draft.dto";
import { UpdatePropositionDraftDto } from "./dto/update-proposition-draft.dto";
import { WithdrawPropositionSubmissionDto } from "./dto/withdraw-proposition-submission.dto";
import { PropositionDraftService } from "./services/proposition-draft.service";

@Controller("arena/propositions")
export class ArenaPropositionsController {
  constructor(private readonly drafts: PropositionDraftService) {}

  @Get("drafts")
  listDrafts(
    @Query() query: ListPropositionDraftsQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.listDrafts({
      userId: this.getUserId(request),
      category: query.category,
      submissionStatus: query.submissionStatus,
    });
  }

  @Get("submissions")
  listSubmissions(
    @Query() query: ListPropositionDraftsQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.listSubmittedDrafts({
      userId: this.getUserId(request),
      category: query.category,
    });
  }

  @Get("drafts/:propositionId")
  getDraft(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.getDraft({
      propositionId,
      userId: this.getUserId(request),
    });
  }

  @Get("submissions/:propositionId")
  getSubmission(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.getSubmittedDraft({
      propositionId,
      userId: this.getUserId(request),
    });
  }

  @Post("drafts")
  createDraft(
    @Body() body: CreatePropositionDraftDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.createDraft({
      userId: this.getUserId(request),
      category: body.category,
      title: body.title,
      summary: body.summary,
      optionA: body.optionA,
      optionB: body.optionB,
      sampleConstraints: body.sampleConstraints,
      minEffectiveSample: body.minEffectiveSample,
      minBetAmount: body.minBetAmount,
      minDurationSeconds: body.minDurationSeconds,
      maxDurationSeconds: body.maxDurationSeconds,
      rewardBudget: body.rewardBudget,
      baseResponseReward: body.baseResponseReward,
      marketEnabled: body.marketEnabled,
    });
  }

  @Patch("drafts/:propositionId")
  updateDraft(
    @Param("propositionId") propositionId: string,
    @Body() body: UpdatePropositionDraftDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.updateDraft({
      propositionId,
      userId: this.getUserId(request),
      category: body.category,
      title: body.title,
      summary: body.summary,
      optionA: body.optionA,
      optionB: body.optionB,
      sampleConstraints: body.sampleConstraints,
      minEffectiveSample: body.minEffectiveSample,
      minBetAmount: body.minBetAmount,
      minDurationSeconds: body.minDurationSeconds,
      maxDurationSeconds: body.maxDurationSeconds,
      rewardBudget: body.rewardBudget,
      baseResponseReward: body.baseResponseReward,
      marketEnabled: body.marketEnabled,
    });
  }

  @Post("drafts/:propositionId/submit")
  submitDraft(
    @Param("propositionId") propositionId: string,
    @Body() body: SubmitPropositionDraftDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.submitDraft({
      propositionId,
      userId: this.getUserId(request),
      note: body.note,
    });
  }

  @Post("submissions/:propositionId/withdraw")
  withdrawSubmission(
    @Param("propositionId") propositionId: string,
    @Body() body: WithdrawPropositionSubmissionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.withdrawSubmittedDraft({
      propositionId,
      userId: this.getUserId(request),
      note: body.note,
    });
  }

  @Delete("drafts/:propositionId")
  deleteDraft(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.drafts.archiveDraft({
      propositionId,
      userId: this.getUserId(request),
    });
  }

  private getUserId(request: RequestWithUser): string {
    return request.user?.sub as string;
  }
}
