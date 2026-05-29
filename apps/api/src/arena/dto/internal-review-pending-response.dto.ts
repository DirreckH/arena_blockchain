import { IsISO8601 } from "class-validator";

export class InternalReviewPendingResponseDto {
  @IsISO8601()
  reviewedAt!: string;
}
