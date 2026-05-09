import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import type { HealthSnapshot, ReadinessSnapshot } from "@arena/shared";

import { Public } from "../common/decorators/public.decorator";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get("live")
  live(): HealthSnapshot {
    return this.healthService.getLiveSnapshot();
  }

  @Public()
  @Get("ready")
  async ready(): Promise<ReadinessSnapshot> {
    const snapshot = await this.healthService.getReadinessSnapshot();

    if (snapshot.status !== "ok") {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Service readiness check failed",
        details: snapshot,
      });
    }

    return snapshot;
  }
}
