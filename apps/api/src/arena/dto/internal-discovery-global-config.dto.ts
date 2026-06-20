import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

class InternalDiscoveryGlobalCategoryConfigDto {
  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  pathname?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  directoryLabel?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @IsIn(["visible", "hidden", "deleted"])
  pageState?: "visible" | "hidden" | "deleted";

  @IsOptional()
  @IsString()
  @IsIn(["system", "custom"])
  kind?: "system" | "custom";

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  marketIdWhitelist?: string[];
}

class InternalDiscoverySecondaryCapsuleDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @IsIn(["visible", "hidden", "deleted"])
  pageState?: "visible" | "hidden" | "deleted";

  @IsOptional()
  @IsString()
  @IsIn(["system", "custom"])
  kind?: "system" | "custom";

  @IsOptional()
  @IsString()
  @IsIn(["all", "general", "dao", "politics", "sports", "tech", "research", "culture"])
  baseRankingId?:
    | 'all'
    | 'general'
    | 'dao'
    | 'politics'
    | 'sports'
    | 'tech'
    | 'research'
    | 'culture'
    | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  marketIdWhitelist?: string[];
}

class InternalDiscoveryRankingCategoryLabelsDto {
  @IsOptional()
  @IsString()
  all?: string;

  @IsOptional()
  @IsString()
  general?: string;

  @IsOptional()
  @IsString()
  dao?: string;

  @IsOptional()
  @IsString()
  politics?: string;

  @IsOptional()
  @IsString()
  sports?: string;

  @IsOptional()
  @IsString()
  tech?: string;

  @IsOptional()
  @IsString()
  research?: string;

  @IsOptional()
  @IsString()
  culture?: string;
}

export class InternalDiscoveryGlobalConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalDiscoveryGlobalCategoryConfigDto)
  categories!: InternalDiscoveryGlobalCategoryConfigDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => InternalDiscoveryRankingCategoryLabelsDto)
  rankingCategoryLabels!: InternalDiscoveryRankingCategoryLabelsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalDiscoverySecondaryCapsuleDto)
  secondaryCapsules?: InternalDiscoverySecondaryCapsuleDto[];
}
