import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateDispatchTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @IsISO8601()
  assignedAt!: string;

  @IsISO8601()
  expiresAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAssignments?: number;
}
