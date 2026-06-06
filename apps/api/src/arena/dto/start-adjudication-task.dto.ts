import { IsISO8601 } from "class-validator";

export class StartAdjudicationTaskDto {
  @IsISO8601()
  startedAt!: string;
}
