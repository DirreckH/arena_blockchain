import { Type } from "class-transformer";
import {
  IsIn,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsUrl,
  ValidateNested,
  IsString,
  Max,
  Min,
} from "class-validator";

class RequesterComparisonSetDeliveryWebhookTransportDto {
  @IsIn(["webhook"])
  type!: "webhook";

  @IsUrl({
    require_tld: false,
  })
  targetUrl!: string;

  @IsOptional()
  @IsString()
  credentialKey?: string;
}

export class UpdateRequesterComparisonSetDeliveryPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(["daily"])
  cadence?: "daily";

  @IsOptional()
  @IsISO8601()
  nextRunAt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  retainedExportCount?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RequesterComparisonSetDeliveryWebhookTransportDto)
  transport?: RequesterComparisonSetDeliveryWebhookTransportDto;
}
