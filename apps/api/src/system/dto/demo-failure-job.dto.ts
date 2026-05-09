import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class DemoFailureJobDto {
  @IsOptional()
  @IsBoolean()
  forcePermanentFailure?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  failuresBeforeSuccess?: number;
}
