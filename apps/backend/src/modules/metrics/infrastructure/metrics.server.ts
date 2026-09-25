import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { MetricsRegistry } from "../application/metrics.registry";
import type { MetricsConfig } from "./metrics.config";

export const METRICS_CONFIG = Symbol("METRICS_CONFIG");

/**
 * Отдаёт `/metrics` на отдельном порту, а не рядом с API.
 *
 * Метрики без авторизации рассказывают о системе слишком много, чтобы
 * публиковать их вместе с REST и WebSocket. Отдельный порт наружу не
 * пробрасывается: Prometheus читает его изнутри сети Docker, а API остаётся
 * единственным открытым входом.
 */
@Injectable()
export class MetricsServer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MetricsServer.name);
  private server: Server | null = null;

  constructor(
    private readonly metrics: MetricsRegistry,
    @Inject(METRICS_CONFIG) private readonly config: MetricsConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const server = createServer((request, response) => {
      if (request.method !== "GET" || request.url !== "/metrics") {
        response.writeHead(404).end();

        return;
      }

      this.metrics
        .render()
        .then((body) => {
          response.writeHead(200, { "Content-Type": this.metrics.contentType });
          response.end(body);
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Could not render metrics: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          response.writeHead(500).end();
        });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.config.port, this.config.host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.logger.log(
      `Serving metrics at http://${this.config.host}:${this.address()?.port ?? this.config.port}/metrics`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    this.server = null;

    if (server === null) {
      return;
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Фактический адрес: при порте `0` его выбирает система. */
  address(): AddressInfo | null {
    const address = this.server?.address();

    return address !== null && typeof address === "object" ? address : null;
  }
}
