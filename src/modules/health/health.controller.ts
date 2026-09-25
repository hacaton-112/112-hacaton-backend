import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from "@nestjs/terminus";

import { ApiRoutes } from "@/contracts";

import { DatabaseHealthIndicator } from "./indicators/database.indicator";
import {
  RuntimeHealthService,
  type RuntimeHealth,
} from "./application/runtime-health.service";

@Controller(ApiRoutes.Health)
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: DatabaseHealthIndicator,
    private runtime: RuntimeHealthService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.isHealthy("database")]);
  }

  /**
   * Насколько процесс успевает за голосом. Каждое чтение начинает новое окно
   * измерения, поэтому цифры относятся к промежутку между двумя запросами.
   */
  @Get("runtime")
  runtimeHealth(): RuntimeHealth {
    return this.runtime.snapshot();
  }
}
