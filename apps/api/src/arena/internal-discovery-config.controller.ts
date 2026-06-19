import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { InternalDiscoveryCategoryConfigDto } from "./dto/internal-discovery-category-config.dto";
import { InternalDiscoveryGlobalConfigDto } from "./dto/internal-discovery-global-config.dto";
import { DiscoveryConfigService } from "./services/discovery-config.service";

@ArenaSurfaceBoundary("internal")
@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/discovery/config")
export class ArenaInternalDiscoveryConfigController {
  constructor(private readonly discoveryConfig: DiscoveryConfigService) {}

  @Get("global")
  getGlobalConfig() {
    return this.discoveryConfig.getGlobalConfig();
  }

  @Put("global")
  @Roles(SystemRole.Admin, SystemRole.System)
  updateGlobalConfig(@Body() body: InternalDiscoveryGlobalConfigDto) {
    return this.discoveryConfig.updateGlobalConfig(body);
  }

  @Get("categories")
  listCategoryConfigs() {
    return this.discoveryConfig.listCategoryConfigs();
  }

  @Get("categories/:slug")
  getCategoryConfig(@Param("slug") slug: string) {
    return this.discoveryConfig.getCategoryConfig(slug);
  }

  @Put("categories/:slug")
  @Roles(SystemRole.Admin, SystemRole.System)
  updateCategoryConfig(
    @Param("slug") slug: string,
    @Body() body: InternalDiscoveryCategoryConfigDto,
  ) {
    return this.discoveryConfig.updateCategoryConfig(slug, body);
  }
}
