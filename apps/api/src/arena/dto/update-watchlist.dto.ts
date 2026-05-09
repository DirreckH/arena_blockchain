import { IsString } from "class-validator";

export class UpdateWatchlistDto {
  @IsString()
  marketId!: string;
}
