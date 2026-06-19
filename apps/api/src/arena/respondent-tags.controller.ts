import { Controller, Get, Req } from "@nestjs/common";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { TagService } from "./services/tag.service";

@ArenaSurfaceBoundary("adjudication")
@Controller("arena/adjudication/tags")
export class ArenaRespondentTagsController {
  constructor(private readonly tags: TagService) {}

  @Get()
  getOwnTags(@Req() request: RequestWithUser) {
    return this.tags.getSummaryForUser(request.user?.sub as string);
  }
}
