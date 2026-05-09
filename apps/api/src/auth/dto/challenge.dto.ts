import { IsEthereumAddress, IsInt, IsPositive } from "class-validator";

export class AuthChallengeDto {
  @IsEthereumAddress()
  walletAddress!: string;

  @IsInt()
  @IsPositive()
  chainId!: number;
}
