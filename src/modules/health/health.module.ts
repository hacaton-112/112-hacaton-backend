import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";

import { DatabaseHealthIndicator } from "./indicators/database.indicator";
import { HealthController } from "./health.controller";
import { RuntimeHealthService } from "./runtime-health.service";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RuntimeHealthService],
})
export class HealthModule {}
