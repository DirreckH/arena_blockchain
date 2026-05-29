import { IsOptional, IsString } from "class-validator";

export class CreateRequesterPropositionExportDto {
  @IsOptional()
  @IsString()
  presetId?: string;
}
