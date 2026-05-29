import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { CreateRequesterComparisonSetDto } from "./dto/create-requester-comparison-set.dto";
import { CreateRequesterComparisonSetDeliveryPolicyDto } from "./dto/create-requester-comparison-set-delivery-policy.dto";
import { CreateRequesterComparisonSetExportDto } from "./dto/create-requester-comparison-set-export.dto";
import { CreateRequesterPropositionExportDto } from "./dto/create-requester-proposition-export.dto";
import { CreateRequesterReportPresetDto } from "./dto/create-requester-report-preset.dto";
import { CreatePropositionDraftDto } from "./dto/create-proposition-draft.dto";
import { ListPropositionDraftsQueryDto } from "./dto/list-proposition-drafts-query.dto";
import { RequesterComparisonSetAnalyticsQueryDto } from "./dto/requester-comparison-set-analytics-query.dto";
import { RequesterComparisonSetDeliveryPolicyHealthQueryDto } from "./dto/requester-comparison-set-delivery-policy-health-query.dto";
import { RequesterComparisonSetExportListQueryDto } from "./dto/requester-comparison-set-export-list-query.dto";
import { RequesterComparisonSetDeliveryRunListQueryDto } from "./dto/requester-comparison-set-delivery-run-list-query.dto";
import { RequesterPropositionAnalyticsCompareQueryDto } from "./dto/requester-proposition-analytics-compare-query.dto";
import { RequesterPropositionAnalyticsQueryDto } from "./dto/requester-proposition-analytics-query.dto";
import { SubmitPropositionDraftDto } from "./dto/submit-proposition-draft.dto";
import { UpdateRequesterComparisonSetDto } from "./dto/update-requester-comparison-set.dto";
import { UpdateRequesterComparisonSetDeliveryPolicyDto } from "./dto/update-requester-comparison-set-delivery-policy.dto";
import { UpdateRequesterReportPresetDto } from "./dto/update-requester-report-preset.dto";
import { UpdatePropositionDraftDto } from "./dto/update-proposition-draft.dto";
import { WithdrawPropositionSubmissionDto } from "./dto/withdraw-proposition-submission.dto";
import { RequesterComparisonSetDeliveryPolicyService } from "./services/requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetService } from "./services/requester-comparison-set.service";
import { PropositionDraftService } from "./services/proposition-draft.service";
import { RequesterPropositionViewService } from "./services/requester-proposition-view.service";
import { RequesterReportPresetService } from "./services/requester-report-preset.service";

@Controller("arena/propositions")
export class ArenaPropositionsController {
  constructor(
    private readonly drafts: PropositionDraftService,
    private readonly requesterViews: RequesterPropositionViewService,
    private readonly requesterReportPresets: RequesterReportPresetService,
    private readonly requesterComparisonSets: RequesterComparisonSetService,
    private readonly requesterComparisonSetDeliveryPolicies: RequesterComparisonSetDeliveryPolicyService,
  ) {}

  @Get("mine")
  listOwnedPropositions(@Req() request: RequestWithUser) {
    return this.requesterViews.listOwnedPropositions({
      userId: this.getUserId(request),
    });
  }

  @Get("mine/report-presets")
  listOwnedReportPresets(@Req() request: RequestWithUser) {
    return this.requesterReportPresets.listReportPresetsForUser(
      this.getUserId(request),
    );
  }

  @Post("mine/report-presets")
  createOwnedReportPreset(
    @Body() body: CreateRequesterReportPresetDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterReportPresets.createReportPresetForUser(
      this.getUserId(request),
      body,
    );
  }

  @Get("mine/report-presets/:presetId")
  getOwnedReportPreset(
    @Param("presetId") presetId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterReportPresets.getReportPresetForUser(
      this.getUserId(request),
      presetId,
    );
  }

  @Patch("mine/report-presets/:presetId")
  updateOwnedReportPreset(
    @Param("presetId") presetId: string,
    @Body() body: UpdateRequesterReportPresetDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterReportPresets.updateReportPresetForUser(
      this.getUserId(request),
      presetId,
      body,
    );
  }

  @Delete("mine/report-presets/:presetId")
  deleteOwnedReportPreset(
    @Param("presetId") presetId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterReportPresets.deleteReportPresetForUser(
      this.getUserId(request),
      presetId,
    );
  }

  @Get("mine/comparison-sets")
  listOwnedComparisonSets(@Req() request: RequestWithUser) {
    return this.requesterComparisonSets.listComparisonSetsForUser(
      this.getUserId(request),
    );
  }

  @Post("mine/comparison-sets")
  createOwnedComparisonSet(
    @Body() body: CreateRequesterComparisonSetDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSets.createComparisonSetForUser(
      this.getUserId(request),
      body,
    );
  }

  @Get("mine/comparison-sets/:comparisonSetId")
  getOwnedComparisonSet(
    @Param("comparisonSetId") comparisonSetId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSets.getComparisonSetForUser(
      this.getUserId(request),
      comparisonSetId,
    );
  }

  @Patch("mine/comparison-sets/:comparisonSetId")
  updateOwnedComparisonSet(
    @Param("comparisonSetId") comparisonSetId: string,
    @Body() body: UpdateRequesterComparisonSetDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSets.updateComparisonSetForUser(
      this.getUserId(request),
      comparisonSetId,
      body,
    );
  }

  @Delete("mine/comparison-sets/:comparisonSetId")
  deleteOwnedComparisonSet(
    @Param("comparisonSetId") comparisonSetId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSets.deleteComparisonSetForUser(
      this.getUserId(request),
      comparisonSetId,
    );
  }

  @Get("mine/exports")
  listOwnedPropositionExports(@Req() request: RequestWithUser) {
    return this.requesterViews.listOwnedPropositionExports({
      userId: this.getUserId(request),
    });
  }

  @Get("mine/exports/:exportId")
  getOwnedPropositionExport(
    @Param("exportId") exportId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedPropositionExport({
      userId: this.getUserId(request),
      exportId,
    });
  }

  @Post("mine/exports")
  createOwnedPropositionExport(
    @Body() body: CreateRequesterPropositionExportDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.createOwnedPropositionExport({
      userId: this.getUserId(request),
      presetId: body.presetId,
    });
  }

  @Get("mine/overview")
  getOwnedPropositionOverview(@Req() request: RequestWithUser) {
    return this.requesterViews.getOwnedPropositionOverview({
      userId: this.getUserId(request),
    });
  }

  @Get("mine/analytics")
  getOwnedPropositionAnalytics(
    @Query() query: RequesterPropositionAnalyticsQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedPropositionAnalytics({
      userId: this.getUserId(request),
      windowDays: query.windowDays,
      now: query.now,
      presetId: query.presetId,
    });
  }

  @Get("mine/analytics/compare")
  compareOwnedPropositionAnalytics(
    @Query() query: RequesterPropositionAnalyticsCompareQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.compareOwnedPropositionAnalytics({
      userId: this.getUserId(request),
      presetIds: query.presetIds,
      now: query.now,
    });
  }

  @Get("mine/comparison-sets/:comparisonSetId/analytics")
  getOwnedComparisonSetAnalytics(
    @Param("comparisonSetId") comparisonSetId: string,
    @Query() query: RequesterComparisonSetAnalyticsQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedComparisonSetAnalytics({
      userId: this.getUserId(request),
      comparisonSetId,
      now: query.now,
    });
  }

  @Get("mine/comparison-sets/:comparisonSetId/exports")
  listOwnedComparisonSetExports(
    @Param("comparisonSetId") comparisonSetId: string,
    @Query() query: RequesterComparisonSetExportListQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.listOwnedComparisonSetExports({
      userId: this.getUserId(request),
      comparisonSetId,
      origin: query.origin,
      policyId: query.policyId,
      limit: query.limit,
    });
  }

  @Post("mine/comparison-sets/:comparisonSetId/exports")
  createOwnedComparisonSetExport(
    @Param("comparisonSetId") comparisonSetId: string,
    @Body() _body: CreateRequesterComparisonSetExportDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.createOwnedComparisonSetExport({
      userId: this.getUserId(request),
      comparisonSetId,
    });
  }

  @Get("mine/comparison-sets/:comparisonSetId/exports/:exportId")
  getOwnedComparisonSetExport(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("exportId") exportId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedComparisonSetExport({
      userId: this.getUserId(request),
      comparisonSetId,
      exportId,
    });
  }

  @Delete("mine/comparison-sets/:comparisonSetId/exports/:exportId")
  deleteOwnedComparisonSetExport(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("exportId") exportId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.deleteOwnedComparisonSetExport({
      userId: this.getUserId(request),
      comparisonSetId,
      exportId,
    });
  }

  @Get("mine/comparison-sets/:comparisonSetId/delivery-policies")
  listOwnedComparisonSetDeliveryPolicies(
    @Param("comparisonSetId") comparisonSetId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.listPoliciesForUser(
      this.getUserId(request),
      comparisonSetId,
    );
  }

  @Post("mine/comparison-sets/:comparisonSetId/delivery-policies")
  createOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Body() body: CreateRequesterComparisonSetDeliveryPolicyDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.createPolicyForUser(
      this.getUserId(request),
      comparisonSetId,
      body,
    );
  }

  @Patch("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId")
  updateOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Body() body: UpdateRequesterComparisonSetDeliveryPolicyDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.updatePolicyForUser(
      this.getUserId(request),
      comparisonSetId,
      policyId,
      body,
    );
  }

  @Delete("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId")
  deleteOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.deletePolicyForUser(
      this.getUserId(request),
      comparisonSetId,
      policyId,
    );
  }

  @Post("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/pause")
  @HttpCode(200)
  pauseOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.pausePolicyForUser(
      this.getUserId(request),
      comparisonSetId,
      policyId,
    );
  }

  @Post("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/resume")
  @HttpCode(200)
  resumeOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterComparisonSetDeliveryPolicies.resumePolicyForUser(
      this.getUserId(request),
      comparisonSetId,
      policyId,
    );
  }

  @Get("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/health")
  getOwnedComparisonSetDeliveryPolicyHealth(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Query() query: RequesterComparisonSetDeliveryPolicyHealthQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedComparisonSetDeliveryPolicyHealth({
      userId: this.getUserId(request),
      comparisonSetId,
      policyId,
      now: query.now,
    });
  }

  @Post("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/run")
  runOwnedComparisonSetDeliveryPolicy(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.runOwnedComparisonSetDeliveryPolicy({
      userId: this.getUserId(request),
      comparisonSetId,
      policyId,
    });
  }

  @Get("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/runs")
  listOwnedComparisonSetDeliveryPolicyRuns(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Query() query: RequesterComparisonSetDeliveryRunListQueryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.listOwnedComparisonSetDeliveryPolicyRuns({
      userId: this.getUserId(request),
      comparisonSetId,
      policyId,
      status: query.status,
      triggerType: query.triggerType,
      replay: query.replay,
      limit: query.limit,
    });
  }

  @Post("mine/comparison-sets/:comparisonSetId/delivery-policies/:policyId/runs/:runId/retry")
  retryOwnedComparisonSetDeliveryPolicyRun(
    @Param("comparisonSetId") comparisonSetId: string,
    @Param("policyId") policyId: string,
    @Param("runId") runId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.retryOwnedComparisonSetDeliveryPolicyRun({
      userId: this.getUserId(request),
      comparisonSetId,
      policyId,
      runId,
    });
  }

  @Get("mine/:propositionId/report")
  getOwnedPropositionReport(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedPropositionReport({
      propositionId,
      userId: this.getUserId(request),
    });
  }

  @Get("mine/:propositionId")
  getOwnedPropositionDetail(
    @Param("propositionId") propositionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.requesterViews.getOwnedPropositionDetail({
      propositionId,
      userId: this.getUserId(request),
    });
  }

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
