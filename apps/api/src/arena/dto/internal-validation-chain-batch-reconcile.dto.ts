import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

import { InternalValidationChainCommandDto } from "./internal-validation-chain-command.dto";

export class InternalValidationChainBatchReconcileDto extends InternalValidationChainCommandDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
