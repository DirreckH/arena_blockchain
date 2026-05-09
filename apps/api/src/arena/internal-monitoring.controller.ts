import { Controller, Get, Query } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import { InternalSampleShortageQueryDto } from "./dto/internal-sample-shortage-query.dto";
import { InternalMonitoringService } from "./services/internal-monitoring.service";

@Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
@Controller("arena/internal/monitoring")
export class ArenaInternalMonitoringController {
  constructor(private readonly monitoring: InternalMonitoringService) {}

  @Get("sample-shortage")
  listSampleShortage(@Query() query: InternalSampleShortageQueryDto) {
    return this.monitoring.listSampleShortage(
      query.now,
      query.deadlineWithinMinutes,
    );
  }

  @Get("anomalies")
  listAnomalies() {
    return this.monitoring.listQualityAnomalies();
  }

  @Get("validation-lifecycle-drift")
  listValidationLifecycleDrift() {
    return this.monitoring.listValidationLifecycleDrift();
  }

  @Get("validation-chain")
  getValidationChainHealth() {
    return this.monitoring.getValidationChainHealth();
  }
}
