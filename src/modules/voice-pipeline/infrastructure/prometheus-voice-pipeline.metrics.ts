import { Injectable } from "@nestjs/common";
import type { Counter, Gauge, Histogram } from "prom-client";

import { METRIC_PREFIX, MetricsRegistry } from "@/modules/metrics";

import type {
  VoicePipelineMetrics,
  VoiceTurnKind,
} from "../application/voice-pipeline.metrics";

/**
 * Секунды до первого звука. Разговор перестаёт звучать живым где-то после
 * полутора-двух секунд тишины, поэтому шаги там самые частые.
 */
const FIRST_AUDIO_BUCKETS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 10,
];

const MILLISECONDS_PER_SECOND = 1_000;

@Injectable()
export class PrometheusVoicePipelineMetrics implements VoicePipelineMetrics {
  private readonly sessions: Gauge;
  private readonly replies: Counter<"source">;
  private readonly firstAudio: Histogram<"kind">;
  private readonly failures: Counter<"kind">;

  constructor(metrics: MetricsRegistry) {
    this.sessions = metrics.gauge({
      name: `${METRIC_PREFIX}voice_sessions`,
      help: "Authenticated voice pipeline connections that are open right now",
    });
    this.replies = metrics.counter({
      name: `${METRIC_PREFIX}caller_replies_total`,
      help: "Caller replies by who wrote them: the model or the engine fallback",
      labelNames: ["source"],
    });
    this.firstAudio = metrics.histogram({
      name: `${METRIC_PREFIX}voice_turn_first_audio_seconds`,
      help: "Time from the start of a caller turn to its first audio",
      labelNames: ["kind"],
      buckets: FIRST_AUDIO_BUCKETS,
    });
    this.failures = metrics.counter({
      name: `${METRIC_PREFIX}voice_turn_failures_total`,
      help: "Caller turns that ended with pipeline-failed",
      labelNames: ["kind"],
    });

    // Нулевые ряды видны сразу: без них дашборд пуст до первого звонка, и
    // «нет данных» не отличить от «нет ошибок».
    this.replies.labels("model").inc(0);
    this.replies.labels("fallback").inc(0);
    this.failures.labels("generated").inc(0);
    this.failures.labels("prescribed").inc(0);
  }

  sessionOpened(): void {
    this.sessions.inc();
  }

  sessionClosed(): void {
    this.sessions.dec();
  }

  callerReplyGenerated(source: "model" | "fallback" | "prepared"): void {
    this.replies.labels(source).inc();
  }

  turnCompleted(kind: VoiceTurnKind, timeToFirstAudioMs: number): void {
    this.firstAudio
      .labels(kind)
      .observe(timeToFirstAudioMs / MILLISECONDS_PER_SECOND);
  }

  turnFailed(kind: VoiceTurnKind): void {
    this.failures.labels(kind).inc();
  }
}
