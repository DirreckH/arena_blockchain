import {
  IsBooleanString,
  IsEnum,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";
import type { PropositionCategory } from "@prisma/client";
import type {
  InternalListSortDirection,
  InternalPropositionListSortBy,
} from "../internal-ops.types";

export class InternalReviewQueueQueryDto {
  @IsOptional()
  @IsEnum(
    {
      general: "general",
      dao: "dao",
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(
    {
      createdAt: "createdAt",
      submittedAt: "submittedAt",
      title: "title",
      effectiveSampleCount: "effectiveSampleCount",
      pendingReviewCount: "pendingReviewCount",
      sampleShortageCount: "sampleShortageCount",
    } satisfies Record<InternalPropositionListSortBy, InternalPropositionListSortBy>,
  )
  sortBy?: InternalPropositionListSortBy;

  @IsOptional()
  @IsEnum(
    {
      asc: "asc",
      desc: "desc",
    } satisfies Record<InternalListSortDirection, InternalListSortDirection>,
  )
  sortDirection?: InternalListSortDirection;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}
