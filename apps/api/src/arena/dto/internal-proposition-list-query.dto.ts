import { IsBooleanString, IsEnum, IsISO8601, IsOptional } from "class-validator";
import type { PropositionCategory, PropositionStatus } from "@prisma/client";
import type { PropositionSubmissionStatus } from "../proposition-submission";

export class InternalPropositionListQueryDto {
  @IsOptional()
  @IsEnum(
    {
      draft: "draft",
      scheduled: "scheduled",
      live: "live",
      frozen: "frozen",
      revealing: "revealing",
      settled: "settled",
      closed: "closed",
      archived: "archived",
    } satisfies Record<PropositionStatus, PropositionStatus>,
  )
  status?: PropositionStatus;

  @IsOptional()
  @IsEnum(
    {
      draft: "draft",
      submitted: "submitted",
      approved: "approved",
      rejected: "rejected",
      withdrawn: "withdrawn",
      archived: "archived",
    } satisfies Record<PropositionSubmissionStatus, PropositionSubmissionStatus>,
  )
  submissionStatus?: PropositionSubmissionStatus;

  @IsOptional()
  @IsEnum(
    {
      general: "general",
      sports: "sports",
      ai: "ai",
      brand_research: "brand_research",
      politics: "politics",
      entertainment: "entertainment",
    } satisfies Record<PropositionCategory, PropositionCategory>,
  )
  category?: PropositionCategory;

  @IsOptional()
  @IsBooleanString()
  marketEnabled?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;
}
