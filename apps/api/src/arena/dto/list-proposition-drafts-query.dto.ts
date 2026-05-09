import { PropositionCategory } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import type { PropositionSubmissionStatus } from "../proposition-submission";

export class ListPropositionDraftsQueryDto {
  @IsOptional()
  @IsEnum(PropositionCategory)
  category?: PropositionCategory;

  @IsOptional()
  @IsEnum({
    draft: "draft",
    submitted: "submitted",
  } satisfies Record<Extract<PropositionSubmissionStatus, "draft" | "submitted">, string>)
  submissionStatus?: Extract<PropositionSubmissionStatus, "draft" | "submitted">;
}
