import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class InternalValidationRehearsalCheckpointDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @MaxLength(64)
  stepId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidence?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(132)
  txHash?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  blockNumber?: number;
}
