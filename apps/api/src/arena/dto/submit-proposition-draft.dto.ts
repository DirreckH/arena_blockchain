import { IsOptional, IsString } from "class-validator";

export class SubmitPropositionDraftDto {
  @IsOptional()
  @IsString()
  note?: string;
}
