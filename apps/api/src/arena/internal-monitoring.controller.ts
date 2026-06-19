import { Controller, Get, Query } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { ArenaSurfaceBoundary } from "../common/decorators/arena-surface-boundary.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { InternalSampleShortageQueryDto } from "./dto/internal-sample-shortage-query.dto";
import { InternalMonitoringService } from "./services/internal-monitoring.service";

@ArenaSurfaceBoundary("internal")
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

  @Get("validation-chain/runtime-readiness")
  getValidationChainRuntimeReadiness() {
    return this.monitoring.getValidationChainRuntimeReadiness();
  }

  @Get("runtime-contract")
  getRuntimeContract() {
    return this.monitoring.getRuntimeContract();
  }
}
