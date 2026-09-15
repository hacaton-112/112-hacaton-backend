import { EventEmitter } from "node:events";

import type { NextFunction, Request, Response } from "express";

import { HttpMetrics } from "../application/http-metrics";
import {
  METRIC_PREFIX,
  MetricsRegistry,
} from "../application/metrics.registry";
import { HttpMetricsMiddleware } from "./http-metrics.middleware";

const respond = (
  middleware: HttpMetricsMiddleware,
  request: Partial<Request>,
  statusCode: number,
) => {
  const response = Object.assign(new EventEmitter(), { statusCode });
  const next = jest.fn() as NextFunction;

  middleware.use(request as Request, response as unknown as Response, next);
  response.emit("finish");

  return next;
};

describe(HttpMetricsMiddleware.name, () => {
  it("labels a request by its route template, not by its address", async () => {
    const registry = new MetricsRegistry();
    const middleware = new HttpMetricsMiddleware(new HttpMetrics(registry));

    const next = respond(
      middleware,
      {
        method: "GET",
        baseUrl: "",
        route: { path: "/api/v1/calls/:trainingSessionId/debrief" },
      },
      200,
    );

    expect(next).toHaveBeenCalled();
    // Идентификатор сессии в метку не попадает: иначе каждая учебная сессия
    // стала бы отдельным временным рядом.
    expect(await registry.render()).toContain(
      `${METRIC_PREFIX}http_request_duration_seconds_count{method="GET",route="/api/v1/calls/:trainingSessionId/debrief",status_code="200"} 1`,
    );
  });

  it("puts a request that matched no route under one label", async () => {
    const registry = new MetricsRegistry();

    respond(
      new HttpMetricsMiddleware(new HttpMetrics(registry)),
      { method: "GET", baseUrl: "" },
      404,
    );

    expect(await registry.render()).toContain(
      `route="unmatched",status_code="404"`,
    );
  });

  it("survives Nest creating the middleware more than once", () => {
    // Экземпляр middleware Nest создаёт сам: метрика в его конструкторе
    // регистрировалась повторно, и backend падал на старте.
    const metrics = new HttpMetrics(new MetricsRegistry());

    expect(() => {
      new HttpMetricsMiddleware(metrics);
      new HttpMetricsMiddleware(metrics);
    }).not.toThrow();
  });
});
