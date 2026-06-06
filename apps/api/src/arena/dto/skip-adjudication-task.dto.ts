import { IsISO8601, IsString } from "class-validator";

export class SkipAdjudicationTaskDto {
  @IsISO8601()
  skippedAt!: string;

  @IsString()
  skipReason!: string;
}
