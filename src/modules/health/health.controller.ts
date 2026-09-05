import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from "@nestjs/terminus";

import { ApiRoutes } from "@/contracts";

import { DatabaseHealthIndicator } from "./indicators/database.indicator";

@Controller(ApiRoutes.Health)
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.isHealthy("database")]);
  }
}
