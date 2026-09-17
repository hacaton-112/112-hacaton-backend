import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import helmet from "helmet";
import { WinstonModule } from "nest-winston";

import { env } from "@/core/config/env.config";
import winstonLogger from "@/core/config/winston.config";
import { CoreModule } from "@/core/core.module";

const GLOBAL_API_PREFIX = "api";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(CoreModule, {
    logger: WinstonModule.createLogger({
      instance: winstonLogger,
    }),
  });

  const host = env.HOST;
  const port = env.PORT;

  app.useWebSocketAdapter(new WsAdapter(app));

  // ── Security Headers ─────────────────────────────────────────
  app.use(helmet());

  app.setGlobalPrefix(GLOBAL_API_PREFIX);

  // ── API Versioning ───────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // ── CORS ─────────────────────────────────────────────────────
  const corsOrigins = env.CORS_ORIGINS.split(",").map((origin: string) =>
    origin.trim(),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();

  process.on("uncaughtException", (error) => {
    logger.error(
      `Uncaught Exception: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`Unhandled Rejection: ${message}`, stack);
  });

  await app.listen(port, host, () => {
    logger.log(`Listening at http://${host}:${port}/${GLOBAL_API_PREFIX}`);
  });
}

bootstrap();
