import { PropositionCategory } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class UpdatePropositionDraftDto {
  @IsOptional()
  @IsEnum(PropositionCategory)
  category?: PropositionCategory;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  optionA?: string;

  @IsOptional()
  @IsString()
  optionB?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  sampleConstraints?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minEffectiveSample?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/)
  minBetAmount?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(604800)
  minDurationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(604800)
  maxDurationSeconds?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/)
  rewardBudget?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/)
  baseResponseReward?: string;

  @IsOptional()
  @IsBoolean()
  marketEnabled?: boolean;
}
