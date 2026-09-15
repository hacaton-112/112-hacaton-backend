import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { HttpMetrics } from "../application/http-metrics";

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
  constructor(private readonly metrics: HttpMetrics) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const stopTimer = this.metrics.duration.startTimer();

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
