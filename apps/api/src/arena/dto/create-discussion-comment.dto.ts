import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDiscussionCommentDto {
  @IsString()
  propositionId!: string;

  @IsString()
  @MaxLength(2_000)
  body!: string;

  @IsOptional()
  @IsIn([0, 1])
  optionIndex?: number;

  @IsISO8601()
  createdAt!: string;
}
