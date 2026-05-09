import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { CreateAccountExportDto } from "./dto/create-account-export.dto";
import { UpdateAccountPreferencesDto } from "./dto/update-account-preferences.dto";
import { UpdateWatchlistDto } from "./dto/update-watchlist.dto";
import { AccountExportService } from "./services/account-export.service";
import { AccountPreferencesService } from "./services/account-preferences.service";
import { AccountViewService } from "./services/account-view.service";
import { WatchlistService } from "./services/watchlist.service";

@Controller("arena/adjudication/account")
export class ArenaRespondentAccountController {
  constructor(
    private readonly accountViews: AccountViewService,
    private readonly accountPreferences: AccountPreferencesService,
    private readonly watchlist: WatchlistService,
    private readonly accountExports: AccountExportService,
  ) {}

  @Get("overview")
  getOwnAccountOverview(@Req() request: RequestWithUser) {
    return this.accountViews.getAccountOverviewForUser(
      request.user?.sub as string,
    );
  }

  @Get("preferences")
  getOwnAccountPreferences(@Req() request: RequestWithUser) {
    return this.accountPreferences.getAccountPreferencesForUser(
      request.user?.sub as string,
    );
  }

  @Patch("preferences")
  updateOwnAccountPreferences(
    @Body() body: UpdateAccountPreferencesDto,
    @Req() request: RequestWithUser,
  ) {
    return this.accountPreferences.updateAccountPreferencesForUser(
      request.user?.sub as string,
      body,
    );
  }

  @Get("exports")
  getOwnAccountExports(@Req() request: RequestWithUser) {
    return this.accountExports.listAccountExportsForUser(
      request.user?.sub as string,
    );
  }

  @Post("exports")
  createOwnAccountExport(
    @Body() body: CreateAccountExportDto,
    @Req() request: RequestWithUser,
  ) {
    return this.accountExports.createAccountExportForUser(
      request.user?.sub as string,
      body,
    );
  }

  @Get("watchlist")
  getOwnWatchlist(@Req() request: RequestWithUser) {
    return this.watchlist.getWatchlistForUser(
      request.user?.sub as string,
    );
  }

  @Post("watchlist")
  saveOwnWatchlistItem(
    @Body() body: UpdateWatchlistDto,
    @Req() request: RequestWithUser,
  ) {
    return this.watchlist.saveWatchlistItemForUser(
      request.user?.sub as string,
      body,
    );
  }

  @Delete("watchlist/:marketId")
  removeOwnWatchlistItem(
    @Param("marketId") marketId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.watchlist.removeWatchlistItemForUser(
      request.user?.sub as string,
      marketId,
    );
  }
}
