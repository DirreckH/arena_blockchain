import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ArenaIdService } from "../arena/arena-id.service";
import { ArenaUserRepository } from "../arena/repositories/arena-user.repository";
import { ArenaUserSessionRepository } from "../arena/repositories/arena-user-session.repository";
import { ArenaUserWalletRepository } from "../arena/repositories/arena-user-wallet.repository";
import { RewardLedgerRepository } from "../arena/repositories/reward-ledger.repository";
import { RewardPayoutRepository } from "../arena/repositories/reward-payout.repository";
import { RewardPayoutExecutionService } from "../arena/services/reward-payout-execution.service";
import { RewardPayoutService } from "../arena/services/reward-payout.service";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../database/prisma.service";
import { AuthChallengeStore } from "./auth-challenge.store";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: {
          expiresIn: "1d",
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    ArenaIdService,
    ArenaUserRepository,
    ArenaUserWalletRepository,
    ArenaUserSessionRepository,
    RewardLedgerRepository,
    RewardPayoutRepository,
    RewardPayoutExecutionService,
    RewardPayoutService,
    AuthService,
    AuthChallengeStore,
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
