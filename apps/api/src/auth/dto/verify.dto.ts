import { IsEthereumAddress, IsInt, IsPositive, IsString, Matches } from "class-validator";

export class AuthVerifyDto {
  @IsEthereumAddress()
  walletAddress!: string;

  @IsInt()
  @IsPositive()
  chainId!: number;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]+$/, {
    message: "signature must be a valid hex string",
  })
  signature!: string;
}
