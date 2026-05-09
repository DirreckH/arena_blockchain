import { Body, Controller, Get, Post, Req } from "@nestjs/common";

import type { AuthChallengeResponse, JwtIdentity } from "@arena/shared";

import { Public } from "../common/decorators/public.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { AuthService, type AuthTokenResponse } from "./auth.service";
import { AuthChallengeDto } from "./dto/challenge.dto";
import { AuthVerifyDto } from "./dto/verify.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("challenge")
  createChallenge(@Body() body: AuthChallengeDto): Promise<AuthChallengeResponse> {
    return this.authService.createChallenge(body.walletAddress, body.chainId);
  }

  @Public()
  @Post("verify")
  verifySignature(@Body() body: AuthVerifyDto): Promise<AuthTokenResponse> {
    return this.authService.verifySignature(
      body.walletAddress,
      body.chainId,
      body.signature,
    );
  }

  @Get("me")
  getProfile(@Req() request: RequestWithUser): JwtIdentity {
    return request.user;
  }
}
