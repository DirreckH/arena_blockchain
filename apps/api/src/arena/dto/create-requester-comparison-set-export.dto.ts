import { IsEnum, IsOptional } from "class-validator";

export class CreateRequesterComparisonSetExportDto {
  @IsOptional()
  @IsEnum(["json", "csv"])
  format?: "json" | "csv";
}
