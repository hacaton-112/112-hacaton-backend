import { NestFactory } from "@nestjs/core";

import { CoreModule } from "@/core/core.module";
import { DdsReferenceService } from "@/modules/dds-exercise/application/dds-reference.service";

async function main(): Promise<void> {
  const started = Date.now();
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  try {
    const result = await app
      .get(DdsReferenceService)
      .preparePublished(({ versionId, durationMs, ok }) => {
        console.log(
          `${ok ? "готов" : "ошибка"} ${versionId}: ${Math.round(durationMs / 100) / 10} с`,
        );
      });
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    console.log(
      `Подготовлено: ${result.prepared}, ошибок: ${result.failed}, время: ${seconds} с.`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
