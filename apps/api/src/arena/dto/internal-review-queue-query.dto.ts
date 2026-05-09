import { IsBooleanString, IsEnum, IsISO8601, IsOptional } from "class-validator";
import type { PropositionCategory } from "@prisma/client";

export class InternalReviewQueueQueryDto {
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
