import { PropositionCategory } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class UpdateRequesterReportPresetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsEnum(PropositionCategory, { each: true })
  categories?: PropositionCategory[];

  @IsOptional()
  @IsBoolean()
  marketEnabledOnly?: boolean;

  @IsOptional()
  @IsEnum(["all", "settled", "unresolved"])
  statusScope?: "all" | "settled" | "unresolved";

  @IsOptional()
  @IsEnum(["json"])
  defaultExportFormat?: "json";
}
