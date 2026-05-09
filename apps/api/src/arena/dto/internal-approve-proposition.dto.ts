import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalApprovePropositionDto {
  @IsISO8601()
  publishedAt!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
