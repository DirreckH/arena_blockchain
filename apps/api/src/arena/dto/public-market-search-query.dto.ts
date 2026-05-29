import { IsOptional, IsString, MaxLength } from "class-validator";

export class PublicMarketSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
