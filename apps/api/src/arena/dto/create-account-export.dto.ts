import { IsIn, IsOptional } from "class-validator";

export class CreateAccountExportDto {
  @IsOptional()
  @IsIn(["json"])
  format?: "json";
}
