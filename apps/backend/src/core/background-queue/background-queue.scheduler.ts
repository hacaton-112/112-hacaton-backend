import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface BackgroundQueueHandler {
  name: string;
  enabled: () => boolean;
  run: () => Promise<void>;
}

/** Один таймер будит все устойчивые очереди; сами очереди по-прежнему атомарно захватывают задания в БД. */
@Injectable()
export class BackgroundQueueScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundQueueScheduler.name);
  private readonly handlers = new Map<string, BackgroundQueueHandler>();
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const configured = Number(
      this.config.get("BACKGROUND_QUEUE_POLL_MS") ?? 2_000,
    );
    const pollMs = Number.isFinite(configured)
      ? Math.min(3_000, Math.max(1_500, configured))
      : 2_000;
    this.timer = setInterval(() => void this.runOnce(), pollMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  register(handler: BackgroundQueueHandler): void {
    this.handlers.set(handler.name, handler);
    this.wake();
  }

  wake(): void {
    queueMicrotask(() => void this.runOnce());
  }

  isEnabled(name: string): boolean {
    return this.handlers.get(name)?.enabled() ?? false;
  }

  async runOnce(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const active = [...this.handlers.values()].filter(({ enabled }) =>
        enabled(),
      );
      const results = await Promise.allSettled(active.map(({ run }) => run()));
      results.forEach((result, index) => {
        if (result.status === "rejected")
          this.logger.warn(
            `Очередь ${active[index]!.name} не опрошена: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          );
      });
    } finally {
      this.ticking = false;
    }
  }
}
