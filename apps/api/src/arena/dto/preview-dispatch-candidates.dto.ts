import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class PreviewDispatchCandidatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @IsISO8601()
  assignedAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAssignments?: number;
}
