import {
  IsBoolean,
  IsIn,
  IsObject,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type {
  RespondentAccountAvatarStyle,
  RespondentAccountDeveloperEnvironment,
  RespondentAccountDeveloperScope,
  RespondentAccountExportPeriod,
  RespondentAccountLandingView,
  RespondentAccountMetricView,
  RespondentAccountProfileVisibility,
  RespondentAccountTimeDisplay,
} from "@arena/shared";

class AccountNotificationPreferencesDto {
  @IsBoolean()
  emailSettlement!: boolean;

  @IsBoolean()
  emailWatchlistUpdate!: boolean;

  @IsBoolean()
  emailSecurityAlert!: boolean;

  @IsBoolean()
  appOrderFilled!: boolean;

  @IsBoolean()
  appSettlement!: boolean;

  @IsBoolean()
  appWatchlistUpdate!: boolean;

  @IsBoolean()
  reviewSubmissionReceived!: boolean;

  @IsBoolean()
  reviewNeedMoreInfo!: boolean;

  @IsBoolean()
  reviewDecision!: boolean;

  @IsBoolean()
  challengeProgress!: boolean;

  @IsBoolean()
  dailyDigest!: boolean;

  @IsBoolean()
  quietHours!: boolean;

  @IsBoolean()
  onlyImportant!: boolean;

  @IsBoolean()
  syncEmailAndApp!: boolean;
}

class AccountProfilePreferencesDto {
  @IsIn(["initial", "image"] satisfies RespondentAccountAvatarStyle[])
  avatarStyle!: RespondentAccountAvatarStyle;

  @IsIn(
    ["overview", "performance", "positions"] satisfies RespondentAccountLandingView[],
  )
  landingView!: RespondentAccountLandingView;

  @IsIn(["members", "public"] satisfies RespondentAccountProfileVisibility[])
  profileVisibility!: RespondentAccountProfileVisibility;
}

class AccountPrivacyPreferencesDto {
  @IsBoolean()
  showAccountSummary!: boolean;

  @IsBoolean()
  showSettledHistory!: boolean;

  @IsBoolean()
  allowActivityIndexing!: boolean;
}

class AccountSecurityPreferencesDto {
  @IsBoolean()
  twoFactorEnabled!: boolean;

  @IsBoolean()
  withdrawalConfirmEnabled!: boolean;
}

class AccountDevicePreferencesDto {
  @IsBoolean()
  rememberTrustedDevice!: boolean;

  @IsBoolean()
  sessionAlertsEnabled!: boolean;
}

class AccountWalletPreferencesDto {
  @IsBoolean()
  walletConnected!: boolean;

  @IsBoolean()
  signingReminderEnabled!: boolean;

  @IsIn(["usdc", "shares"] satisfies RespondentAccountMetricView[])
  metricView!: RespondentAccountMetricView;

  @IsIn(["absolute", "relative"] satisfies RespondentAccountTimeDisplay[])
  timeDisplay!: RespondentAccountTimeDisplay;

  @IsBoolean()
  highlightSettlement!: boolean;

  @IsBoolean()
  hideSmallFills!: boolean;
}

class AccountExportPreferencesDto {
  @IsIn(["30d", "90d"] satisfies RespondentAccountExportPeriod[])
  period!: RespondentAccountExportPeriod;

  @IsBoolean()
  includeSettlementAttachment!: boolean;

  @IsBoolean()
  maskWalletAddress!: boolean;
}

class AccountDeveloperPreferencesDto {
  @IsBoolean()
  keyCreated!: boolean;

  @IsBoolean()
  whitelistEnabled!: boolean;

  @IsIn(["sandbox", "production"] satisfies RespondentAccountDeveloperEnvironment[])
  environment!: RespondentAccountDeveloperEnvironment;

  @IsBoolean()
  codeEnabled!: boolean;

  @IsIn(["self", "team"] satisfies RespondentAccountDeveloperScope[])
  scope!: RespondentAccountDeveloperScope;
}

export class UpdateAccountPreferencesDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AccountNotificationPreferencesDto)
  notificationPreferences!: AccountNotificationPreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountProfilePreferencesDto)
  profile!: AccountProfilePreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountPrivacyPreferencesDto)
  privacy!: AccountPrivacyPreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountSecurityPreferencesDto)
  security!: AccountSecurityPreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountDevicePreferencesDto)
  devices!: AccountDevicePreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountWalletPreferencesDto)
  wallet!: AccountWalletPreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountExportPreferencesDto)
  exports!: AccountExportPreferencesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountDeveloperPreferencesDto)
  developer!: AccountDeveloperPreferencesDto;
}
