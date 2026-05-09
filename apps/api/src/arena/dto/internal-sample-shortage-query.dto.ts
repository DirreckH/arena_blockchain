import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsOptional, Min } from "class-validator";

export class InternalSampleShortageQueryDto {
  @IsOptional()
  @IsISO8601()
  now?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deadlineWithinMinutes?: number;
}
