import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateRequesterPropositionExportDto {
  @IsOptional()
  @IsString()
  presetId?: string;

  @IsOptional()
  @IsEnum(["json", "csv"])
  format?: "json" | "csv";
}
