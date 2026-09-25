import { Controller, Get, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import {
  configureFastifyRequestLifecycle,
  createFastifyAdapter,
  type FastifyNestApplication,
} from "@/core/http/fastify.adapter";
import { HttpMetrics } from "@/modules/metrics/application/http-metrics";
import { MetricsRegistry } from "@/modules/metrics/application/metrics.registry";
import { MetricsModule } from "@/modules/metrics/metrics.module";

@Controller("probe")
class ProbeController {
  @Get(":id")
  read(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), MetricsModule],
  controllers: [ProbeController],
})
class ProbeModule {}

describe(MetricsModule.name, () => {
  let app: FastifyNestApplication;
  const previousEnabled = process.env.METRICS_ENABLED;

  beforeAll(async () => {
    // Отдельный порт метрик в этом тесте не нужен и мешал бы параллельным
    // прогонам.
    process.env.METRICS_ENABLED = "false";
    const adapter = createFastifyAdapter();
    app = await NestFactory.create<FastifyNestApplication>(
      ProbeModule,
      adapter,
      { logger: false },
    );
    configureFastifyRequestLifecycle(adapter, app.get(HttpMetrics));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.METRICS_ENABLED = previousEnabled;
  });

  it("starts a real application and counts its requests by route template", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/probe/session-42",
    });

    expect(response.statusCode).toBe(200);
    expect(await app.get(MetricsRegistry).render()).toContain(
      'route="/probe/:id",status_code="200"',
    );
  });

  it("groups unmatched requests under one bounded label", async () => {
    const response = await app.inject({ method: "GET", url: "/missing/42" });

    expect(response.statusCode).toBe(404);
    expect(await app.get(MetricsRegistry).render()).toContain(
      'route="unmatched",status_code="404"',
    );
  });
});
