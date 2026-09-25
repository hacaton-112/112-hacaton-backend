import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

const NANOSECONDS_PER_MILLISECOND = 1e6;
/**
 * Шаг опроса. Из каждого значения он же и вычитается: гистограмма измеряет
 * промежуток целиком, поэтому на простаивающем процессе она показывала бы шаг
 * опроса вместо нуля.
 */
const SAMPLE_RESOLUTION_MS = 1;

export interface RuntimeHealth {
  /** Задержка цикла событий в миллисекундах с прошлого чтения. */
  eventLoopDelayMs: {
    mean: number;
    p50: number;
    p90: number;
    p99: number;
    max: number;
  };
  memory: { rssMb: number; heapUsedMb: number };
  uptimeSeconds: number;
}

/**
 * Сколько backend не успевает.
 *
 * Голос идёт через тот же процесс, что и остальная работа, поэтому вопрос
 * «выдержит ли параллельные звонки» упирается не в загрузку процессора, а в
 * задержку цикла событий: пока он занят, кадры PCM стоят в очереди и оператор
 * слышит рваную речь. Чтение обнуляет окно — так каждый прогон нагрузки видит
 * свои цифры, а не средние за всё время жизни процесса.
 */
@Injectable()
export class RuntimeHealthService implements OnModuleInit, OnModuleDestroy {
  private histogram: IntervalHistogram | null = null;

  onModuleInit(): void {
    this.histogram = monitorEventLoopDelay({
      resolution: SAMPLE_RESOLUTION_MS,
    });
    this.histogram.enable();
  }

  onModuleDestroy(): void {
    this.histogram?.disable();
    this.histogram = null;
  }

  snapshot(): RuntimeHealth {
    const histogram = this.histogram;
    const memory = process.memoryUsage();
    const eventLoopDelayMs =
      histogram === null
        ? { mean: 0, p50: 0, p90: 0, p99: 0, max: 0 }
        : {
            mean: toMs(histogram.mean),
            p50: toMs(histogram.percentile(50)),
            p90: toMs(histogram.percentile(90)),
            p99: toMs(histogram.percentile(99)),
            max: toMs(histogram.max),
          };

    histogram?.reset();

    return {
      eventLoopDelayMs,
      memory: {
        rssMb: toMb(memory.rss),
        heapUsedMb: toMb(memory.heapUsed),
      },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}

/** Пустая гистограмма отдаёт бесконечность; для отчёта это ноль. */
const toMs = (nanoseconds: number): number => {
  if (!Number.isFinite(nanoseconds)) {
    return 0;
  }

  const delayMs =
    nanoseconds / NANOSECONDS_PER_MILLISECOND - SAMPLE_RESOLUTION_MS;

  return Math.max(0, Math.round(delayMs * 100) / 100);
};

const toMb = (bytes: number): number => Math.round(bytes / 1_024 / 1_024);
