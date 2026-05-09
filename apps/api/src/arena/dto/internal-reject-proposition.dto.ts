import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class InternalRejectPropositionDto {
  @IsOptional()
  @IsISO8601()
  rejectedAt?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
