import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { WinstonModule } from "nest-winston";

import { env } from "@/core/config/env.config";
import {
  configureFastifyRequestLifecycle,
  createFastifyAdapter,
  type FastifyNestApplication,
  registerFastifyPlugins,
} from "@/core/http/fastify.adapter";
import winstonLogger from "@/core/config/winston.config";
import { CoreModule } from "@/core/core.module";
import { HttpMetrics } from "@/modules/metrics/application/http-metrics";

const GLOBAL_API_PREFIX = "api";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const adapter = createFastifyAdapter();
  const app = await NestFactory.create<FastifyNestApplication>(
    CoreModule,
    adapter,
    {
      logger: WinstonModule.createLogger({
        instance: winstonLogger,
      }),
    },
  );

  const host = env.HOST;
  const port = env.PORT;

  configureFastifyRequestLifecycle(adapter, app.get(HttpMetrics));
  app.useWebSocketAdapter(new WsAdapter(app));

  // ── Fastify-native security and multipart plugins ────────────
  await registerFastifyPlugins(app);

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
    // Рабочее место опрашивает очередь постоянно, а каждый запрос с токеном
    // тянет за собой preflight: без кеша их ровно столько же, сколько GET.
    maxAge: 600,
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

  await app.listen({ host, port });
  logger.log(`Listening at http://${host}:${port}/${GLOBAL_API_PREFIX}`);
}

bootstrap();
