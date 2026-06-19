import { Controller, Get, Param } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { TagService } from "./services/tag.service";

@ArenaSurfaceBoundary("internal")
@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/respondents")
export class ArenaInternalTagsController {
  constructor(private readonly tags: TagService) {}

  @Get(":userId/tags")
  getRespondentTags(@Param("userId") userId: string) {
    return this.tags.getInternalViewForUser(userId);
  }
}
