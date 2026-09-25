import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { HttpMetrics } from "./application/http-metrics";
import { MetricsRegistry } from "./application/metrics.registry";
import {
  type MetricsEnvironment,
  parseMetricsConfig,
} from "./infrastructure/metrics.config";
import { METRICS_CONFIG, MetricsServer } from "./infrastructure/metrics.server";

const METRICS_ENVIRONMENT_KEYS = [
  "METRICS_ENABLED",
  "METRICS_HOST",
  "METRICS_PORT",
] as const satisfies readonly (keyof MetricsEnvironment)[];

/**
 * Метрики Prometheus.
 *
 * Глобальный модуль: реестр нужен и HTTP-слою, и голосовому каналу, и каждый
 * модуль, которому есть что считать, получает его без лишнего импорта.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MetricsRegistry,
    HttpMetrics,
    {
      provide: METRICS_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        parseMetricsConfig(
          Object.fromEntries(
            METRICS_ENVIRONMENT_KEYS.map((key) => [
              key,
              configService.get(key),
            ]),
          ),
        ),
    },
    MetricsServer,
  ],
  exports: [HttpMetrics, MetricsRegistry],
})
export class MetricsModule {}
