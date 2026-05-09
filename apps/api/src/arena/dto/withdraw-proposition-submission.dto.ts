import { IsOptional, IsString } from "class-validator";

export class WithdrawPropositionSubmissionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
