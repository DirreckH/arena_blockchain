import { IsBoolean, IsISO8601, IsInt, IsString, Max, Min } from "class-validator";

export class SubmitTaskResponseDto {
  @IsString()
  propositionId!: string;

  @IsInt()
  @Min(0)
  @Max(1)
  selectedOption!: number;

  @IsInt()
  @Min(0)
  @Max(1)
  confirmationOption!: number;

  @IsISO8601()
  clientStartedAt!: string;

  @IsISO8601()
  clientSubmittedAt!: string;

  @IsBoolean()
  understandingAck!: boolean;

  @IsISO8601()
  submittedAt!: string;
}
