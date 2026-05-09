import { IsString, MaxLength } from "class-validator";

import { InternalValidationChainCommandDto } from "./internal-validation-chain-command.dto";

export class InternalValidationChainCancelMarketDto extends InternalValidationChainCommandDto {
  @IsString()
  @MaxLength(64)
  reasonCode!: string;
}
