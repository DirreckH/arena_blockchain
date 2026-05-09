import { IsOptional, IsString, MaxLength } from "class-validator";

export class InternalValidationChainCommandDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
