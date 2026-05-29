import { Body, Controller, Param, Post } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import { CreateDispatchTasksDto } from "./dto/create-dispatch-tasks.dto";
import { PreviewDispatchCandidatesDto } from "./dto/preview-dispatch-candidates.dto";
import { DispatchEngineService } from "./services/dispatch-engine.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/propositions")
export class ArenaInternalDispatchController {
  constructor(private readonly dispatch: DispatchEngineService) {}

  @Post(":propositionId/dispatch")
  createDispatch(
    @Param("propositionId") propositionId: string,
    @Body() body: CreateDispatchTasksDto,
  ) {
    return this.dispatch.createDispatchTasksForProposition({
      propositionId,
      userIds: body.userIds,
      assignedAt: body.assignedAt,
      expiresAt: body.expiresAt,
      maxAssignments: body.maxAssignments,
    });
  }

  @Post(":propositionId/dispatch-preview")
  previewDispatch(
    @Param("propositionId") propositionId: string,
    @Body() body: PreviewDispatchCandidatesDto,
  ) {
    return this.dispatch.previewDispatchCandidates({
      propositionId,
      userIds: body.userIds,
      assignedAt: body.assignedAt,
      maxAssignments: body.maxAssignments,
    });
  }
}
