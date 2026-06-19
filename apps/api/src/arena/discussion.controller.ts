import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { ArenaDiscussionThreadViewModel } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { CreateDiscussionCommentDto } from "./dto/create-discussion-comment.dto";
import { DiscussionService } from "./services/discussion.service";

@ArenaSurfaceBoundary("validation")
@Controller("arena/discussion")
export class ArenaDiscussionController {
  constructor(private readonly discussions: DiscussionService) {}

  @Get("markets/:marketId")
  getMarketDiscussion(
    @Param("marketId") marketId: string,
  ): Promise<ArenaDiscussionThreadViewModel> {
    return this.discussions.getDiscussionThread(marketId);
  }

  @Post("markets/:marketId/comments")
  createComment(
    @Param("marketId") marketId: string,
    @Body() body: CreateDiscussionCommentDto,
    @Req() request: RequestWithUser,
  ): Promise<ArenaDiscussionThreadViewModel> {
    return this.discussions.createDiscussionComment({
      marketId,
      propositionId: body.propositionId,
      userId: request.user?.sub as string,
      body: body.body,
      optionIndex:
        body.optionIndex === 0 || body.optionIndex === 1
          ? (body.optionIndex as 0 | 1)
          : null,
      createdAt: body.createdAt,
    });
  }
}
