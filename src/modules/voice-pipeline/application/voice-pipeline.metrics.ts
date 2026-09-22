/** Реплика заявителя, сочинённая моделью, или заданная сценарием первая фраза. */
export type VoiceTurnKind = "generated" | "prescribed";

/**
 * Что голосовой канал сообщает мониторингу.
 *
 * Порт, а не прямой вызов prom-client: шлюзу важно, что произошло в звонке, а
 * не как это считается, и тесты шлюза проверяют события, а не текст метрик.
 */
export interface VoicePipelineMetrics {
  sessionOpened(): void;
  sessionClosed(): void;
  /** Кто написал реплику: модель или запасной ответ движка. */
  callerReplyGenerated(source: "model" | "fallback" | "prepared"): void;
  /** Сколько оператор ждал первого звука заявителя. */
  turnCompleted(kind: VoiceTurnKind, timeToFirstAudioMs: number): void;
  turnFailed(kind: VoiceTurnKind): void;
}

export const VOICE_PIPELINE_METRICS = Symbol("VOICE_PIPELINE_METRICS");
