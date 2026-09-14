import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { Histogram } from "prom-client";

import {
  METRIC_PREFIX,
  MetricsRegistry,
} from "../application/metrics.registry";

/** Секунды: от быстрых чтений каталога до генерации черновика сценария. */
const HTTP_DURATION_BUCKETS = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

/**
 * Длительность HTTP-запросов по маршруту и статусу.
 *
 * Метка маршрута — шаблон, а не адрес: `/api/v1/calls/:trainingSessionId/debrief`
 * вместо тысячи адресов с разными идентификаторами. Иначе каждая учебная
 * сессия порождала бы свой временной ряд, и Prometheus захлебнулся бы
 * кардинальностью. Запрос мимо всех маршрутов идёт под одной меткой.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  private readonly duration: Histogram<"method" | "route" | "status_code">;

  constructor(metrics: MetricsRegistry) {
    this.duration = metrics.histogram({
      name: `${METRIC_PREFIX}http_request_duration_seconds`,
      help: "Duration of HTTP requests by method, route template and status code",
      labelNames: ["method", "route", "status_code"],
      buckets: HTTP_DURATION_BUCKETS,
    });
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const stopTimer = this.duration.startTimer();

    response.once("finish", () => {
      const route = (request.route as { path?: unknown } | undefined)?.path;

      stopTimer({
        method: request.method,
        route:
          typeof route === "string"
            ? `${request.baseUrl}${route}`
            : "unmatched",
        status_code: String(response.statusCode),
      });
    });

    next();
  }
}
