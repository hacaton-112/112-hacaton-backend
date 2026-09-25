import { z } from "zod";

/**
 * Настройка работника заготовленной озвучки.
 *
 * Значение разбирается схемой, а не сравнивается со строкой: `1` или `True`
 * роняют запуск с понятной ошибкой вместо того, чтобы тихо оставить очередь
 * без движения, пока интерфейс показывает «готовится».
 */
const ScenarioAudioConfigSchema = z.object({
  SCENARIO_AUDIO_WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ScenarioAudioEnvironment = z.input<
  typeof ScenarioAudioConfigSchema
>;

export interface ScenarioAudioConfig {
  /** Готовить ли записи; проверка и воспроизведение работают и без него. */
  readonly workerEnabled: boolean;
}

export const parseScenarioAudioConfig = (
  environment: Partial<Record<keyof ScenarioAudioEnvironment, unknown>>,
): ScenarioAudioConfig => ({
  workerEnabled: ScenarioAudioConfigSchema.parse(environment)
    .SCENARIO_AUDIO_WORKER_ENABLED,
});
