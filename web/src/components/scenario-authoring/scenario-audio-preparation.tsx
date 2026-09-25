import { Button, Card, Flex, Heading, Text } from "@bolid-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_CONFIG } from "../../config/api";
import {
  ScenarioAudioStatusSchema,
  preparationLabel,
} from "../../contracts/scenario-audio";
import { api } from "../../lib/api";

/** Only shown in the instructor editor. No answer bank is downloaded. */
export function ScenarioAudioPreparation({ versionId }: { versionId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["scenario-audio", versionId];
  const url = `${API_CONFIG.getScenarioVersionUrl(versionId)}/audio-preparation`;
  const status = useQuery({
    queryKey,
    queryFn: async () =>
      ScenarioAudioStatusSchema.parse(await api.get<unknown>(url)),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.workerEnabled &&
        ["queued", "preparing"].includes(data.status)
        ? 5_000
        : false;
    },
  });
  const prepare = useMutation({
    mutationFn: async () =>
      ScenarioAudioStatusSchema.parse(await api.post<unknown>(url, {})),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Голосовые ответы для опубликованной версии</Heading>
        <Text size="2" color="gray">
          Заранее озвучиваем типовые реплики, чтобы сократить задержки в звонке.
          Текущие правки формы попадут в озвучку только после публикации новой
          версии. Нестандартные вопросы по-прежнему требуют модели и синтеза
          речи.
        </Text>
        <Text size="2" role="status">
          {status.isError
            ? "Не удалось получить состояние подготовки."
            : status.data
              ? preparationLabel(status.data)
              : "Проверяем готовность…"}
        </Text>
        {status.data && status.data.total > 0 && (
          <Text size="2">
            Готово {status.data.completed} из {status.data.total} записей
          </Text>
        )}
        {prepare.isError && (
          <Text size="2" color="red" role="alert">
            Не удалось запустить подготовку. Попробуйте ещё раз.
          </Text>
        )}
        {status.isError && (
          <Button
            type="button"
            variant="soft"
            onClick={() => void status.refetch()}
          >
            Обновить состояние
          </Button>
        )}
        {status.data &&
          ["not_prepared", "failed"].includes(status.data.status) && (
            <Button
              type="button"
              variant="soft"
              disabled={!status.data.workerEnabled || prepare.isPending}
              onClick={() => prepare.mutate()}
            >
              {prepare.isPending
                ? "Отправляем…"
                : status.data.status === "failed"
                  ? "Продолжить подготовку"
                  : "Подготовить голосовые ответы"}
            </Button>
          )}
      </Flex>
    </Card>
  );
}
