import { z } from "zod";

export const ScenarioAudioStatusSchema = z.object({
  scenarioVersionId: z.string().uuid(),
  status: z.enum(["not_prepared", "queued", "preparing", "ready", "failed"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  workerEnabled: z.boolean(),
});
export type ScenarioAudioStatus = z.infer<typeof ScenarioAudioStatusSchema>;

export const preparationLabel = (status: ScenarioAudioStatus): string => {
  if (status.status === "ready")
    return "Типовые ответы готовы к воспроизведению";
  if (status.status === "failed")
    return "Не удалось завершить озвучку. Готовые записи сохранены — можно повторить.";
  if (!status.workerEnabled)
    return "Фоновая озвучка выключена на сервере. Обратитесь к администратору.";
  if (status.status === "not_prepared")
    return "Для этой версии ещё не подготовлены голосовые ответы.";
  if (status.status === "queued")
    return "Ожидает фоновой озвучки. Во время учебных звонков подготовка приостанавливается.";
  return "Подготавливаем голосовые ответы заявителя…";
};
