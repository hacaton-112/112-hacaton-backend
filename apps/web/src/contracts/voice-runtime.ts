import { z } from "zod";

/** Version 1: mirrored backend contract; counters reset when its process restarts. */
export const VoiceRuntimeSchema = z.object({
  profile: z.enum(["standard", "offline-hybrid"]),
  exceptionBudgetMs: z.number().int().positive(),
  outcomes: z.record(z.string(), z.number().int().nonnegative()),
  scope: z.literal("backend-process"),
  dynamicAudioBuffered: z.boolean(),
});

const labels: Record<string, string> = {
  prepared: "Готовые ответы",
  "local-generated": "Ответы с подготовкой на сервере",
  "prompt-injection": "Запросы вне правил сценария",
  "intent-unavailable": "Не удалось распознать вопрос",
  "unknown-question": "Неизвестные вопросы",
  "unavailable-fact": "Нет разрешённого ответа",
  deadline: "Превышено время ожидания",
  "generation-failed": "Ошибка подготовки текста",
  "ungrounded-response": "Неподтверждённые сведения в ответе",
  "synthesis-failed": "Ошибка озвучивания",
};
export const voiceOutcomeLabel = (key: string): string =>
  labels[key] ?? "Другая причина";
