import { NestFactory } from "@nestjs/core";

import { CoreModule } from "@/core/core.module";
import { DdsReferenceService } from "@/modules/dds-exercise/application/dds-reference.service";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  try {
    const result = await app.get(DdsReferenceService).backfillServices();
    console.log(
      `Службы эталонов: заполнено ${result.updated}, без однозначной службы ${result.unresolved}`,
    );
  } finally {
    await app.close();
  }
}

void main();
