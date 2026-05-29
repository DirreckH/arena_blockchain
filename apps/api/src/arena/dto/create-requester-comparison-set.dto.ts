import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from "class-validator";

export class CreateRequesterComparisonSetDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  presetIds!: string[];
}
