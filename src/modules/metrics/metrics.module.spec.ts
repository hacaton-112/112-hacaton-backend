import { Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { MetricsRegistry } from "./application/metrics.registry";
import { MetricsModule } from "./metrics.module";

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
  let app: INestApplication;
  const previousEnabled = process.env.METRICS_ENABLED;

  beforeAll(async () => {
    // Отдельный порт метрик в этом тесте не нужен и мешал бы параллельным
    // прогонам.
    process.env.METRICS_ENABLED = "false";
    app = await NestFactory.create(ProbeModule, { logger: false });
    await app.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    await app.close();
    process.env.METRICS_ENABLED = previousEnabled;
  });

  it("starts a real application and counts its requests by route template", async () => {
    // Юнит-тесты собирают middleware вручную и не видели, что Nest создаёт его
    // сам: метрика регистрировалась дважды, и приложение не поднималось.
    const response = await fetch(`${await app.getUrl()}/probe/session-42`);

    expect(response.status).toBe(200);
    expect(await app.get(MetricsRegistry).render()).toContain(
      'route="/probe/:id",status_code="200"',
    );
  });
});
