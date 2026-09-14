import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { MetricsRegistry } from "./application/metrics.registry";
import { HttpMetricsMiddleware } from "./infrastructure/http-metrics.middleware";
import {
  type MetricsEnvironment,
  parseMetricsConfig,
} from "./infrastructure/metrics.config";
import { METRICS_CONFIG, MetricsServer } from "./infrastructure/metrics.server";

/**
 * Метрики Prometheus.
 *
 * Глобальный модуль: реестр нужен и HTTP-слою, и голосовому каналу, и каждый
 * модуль, которому есть что считать, получает его без лишнего импорта.
 */
const METRICS_ENVIRONMENT_KEYS = [
  "METRICS_ENABLED",
  "METRICS_HOST",
  "METRICS_PORT",
] as const satisfies readonly (keyof MetricsEnvironment)[];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MetricsRegistry,
    HttpMetricsMiddleware,
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
  exports: [MetricsRegistry],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpMetricsMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
