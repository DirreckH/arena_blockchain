import { Type } from "class-transformer";
import { IsArray, IsString, ValidateNested } from "class-validator";

class InternalDiscoverySidebarItemDto {
  @IsString()
  id!: string;

  @IsString()
  label!: string;

  @IsArray()
  @IsString({ each: true })
  linkedMarketIds!: string[];
}

export class InternalDiscoveryCategoryConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalDiscoverySidebarItemDto)
  sidebarItems!: InternalDiscoverySidebarItemDto[];
}
