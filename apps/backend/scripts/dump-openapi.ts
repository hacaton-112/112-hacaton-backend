import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { CoreModule } from "@/core/core.module";
import { createFastifyAdapter } from "@/core/http/fastify.adapter";
import { createOpenApiDocument } from "@/modules/openapi/domain/openapi-document";

async function main(): Promise<void> {
  const outputDirectory = join(process.cwd(), "docs", "сдача");
  const outputFile = join(outputDirectory, "openapi.json");
  const app = await NestFactory.create(CoreModule, createFastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  try {
    const document = createOpenApiDocument(app);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      outputFile,
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );
    console.log(`OpenAPI сохранён: ${outputFile}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
