import { Controller, Get, Query } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import { InternalAuditEventQueryDto } from "./dto/internal-audit-event-query.dto";
import { InternalAuditService } from "./services/internal-audit.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/audit-events")
export class ArenaInternalAuditController {
  constructor(private readonly audits: InternalAuditService) {}

  @Get()
  listAuditEvents(@Query() query: InternalAuditEventQueryDto) {
    return this.audits.listEvents({
      entityType: query.entityType,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      action: query.action,
      search: query.search,
      sortDirection: query.sortDirection,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }
}
