import { EventEmitter } from "node:events";

import type { NextFunction, Request, Response } from "express";

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
    const metrics = new MetricsRegistry();
    const middleware = new HttpMetricsMiddleware(metrics);

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
    expect(await metrics.render()).toContain(
      `${METRIC_PREFIX}http_request_duration_seconds_count{method="GET",route="/api/v1/calls/:trainingSessionId/debrief",status_code="200"} 1`,
    );
  });

  it("puts a request that matched no route under one label", async () => {
    const metrics = new MetricsRegistry();

    respond(
      new HttpMetricsMiddleware(metrics),
      { method: "GET", baseUrl: "" },
      404,
    );

    expect(await metrics.render()).toContain(
      `route="unmatched",status_code="404"`,
    );
  });
});
