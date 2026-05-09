import { Controller, Get, Req } from "@nestjs/common";

import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { TagService } from "./services/tag.service";

@Controller("arena/adjudication/tags")
export class ArenaRespondentTagsController {
  constructor(private readonly tags: TagService) {}

  @Get()
  getOwnTags(@Req() request: RequestWithUser) {
    return this.tags.getSummaryForUser(request.user?.sub as string);
  }
}
