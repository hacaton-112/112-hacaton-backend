import { Injectable } from "@nestjs/common";
import type { Histogram } from "prom-client";

import { METRIC_PREFIX, MetricsRegistry } from "./metrics.registry";

/** Секунды: от быстрых чтений каталога до генерации черновика сценария. */
const HTTP_DURATION_BUCKETS = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

/**
 * Метрика HTTP-запросов.
 *
 * Живёт в отдельном синглтоне и подключается к корневым Fastify hooks. Поэтому
 * учитываются 404 и потоковые ответы, а гистограмма регистрируется ровно один
 * раз независимо от количества маршрутов.
 */
@Injectable()
export class HttpMetrics {
  readonly duration: Histogram<"method" | "route" | "status_code">;

  constructor(metrics: MetricsRegistry) {
    this.duration = metrics.histogram({
      name: `${METRIC_PREFIX}http_request_duration_seconds`,
      help: "Duration of HTTP requests by method, route template and status code",
      labelNames: ["method", "route", "status_code"],
      buckets: HTTP_DURATION_BUCKETS,
    });
  }
}
