import { Button, Card, Checkbox, Flex, Heading, Text } from "@bolid-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  DialoguePreparationSchema,
  type DialoguePreparation,
} from "../../contracts/dialogue-preparation";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "../../contracts/scenario-authoring";
import { api } from "../../lib/api";
import { messageFrom } from "../../lib/error-message";
import {
  scenarioPreparationKey,
  type PreparationSelection,
} from "./dialogue-preparation-state";
import { DialoguePreparationReview } from "./dialogue-preparation-review";
import { DialogueAudioPreview } from "./dialogue-audio-preview";

const ROOT = "/scenarios/dialogue-preparations";
const SavedPreparationsSchema = z.array(
  z.object({
    id: z.uuid(),
    code: z.string(),
    title: z.string(),
    status: z.string(),
    updatedAt: z.iso.datetime(),
  }),
);
const SnapshotSchema = z.object({
  scenario: ScenarioSeedSchema,
  authoringSource: z.enum(["manual", "assistant"]),
  authoringPrompt: z.string().nullable(),
});
type RestoredSnapshot = z.infer<typeof SnapshotSchema>;
const labels: Record<DialoguePreparation["status"], string> = {
  queued: "Ожидает свободных ресурсов сервера",
  generating: "Готовим варианты вопросов",
  review: "Проверьте вопросы и ответы",
  synthesizing: "Готовим озвучку",
  ready: "Готово к публикации",
  failed: "Подготовка остановлена",
  published: "Набор опубликован",
};

export function DialoguePreparationPanel({
  scenario,
  onChange,
  onRestore,
  authoringSource,
  authoringPrompt,
  scopeCode,
  disabled = false,
}: {
  scenario: unknown;
  onChange: (selection: PreparationSelection | null) => void;
  onRestore: (snapshot: RestoredSnapshot) => void;
  authoringSource: "manual" | "assistant";
  authoringPrompt?: string;
  scopeCode?: string;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<{
    id: string;
    snapshot: ScenarioSeed;
    key: string;
  } | null>(null);
  const [useAi, setUseAi] = useState(false);
  const currentKey = scenarioPreparationKey(scenario);
  const queryKey = ["dialogue-preparation", selected?.id];
  const query = useQuery({
    queryKey,
    enabled: Boolean(selected),
    queryFn: async () =>
      DialoguePreparationSchema.parse(
        await api.get<unknown>(`${ROOT}/${selected!.id}`),
      ),
    refetchInterval: (query) =>
      query.state.data?.workerEnabled &&
      ["queued", "generating", "synthesizing"].includes(query.state.data.status)
        ? 3_000
        : false,
  });
  const create = useMutation({
    mutationFn: async () => {
      const snapshot = ScenarioSeedSchema.parse(scenario);
      const key = scenarioPreparationKey(snapshot)!;
      onChange({ id: null, snapshotKey: key, ready: false });
      const data = DialoguePreparationSchema.parse(
        await api.post<unknown>(ROOT, {
          scenario: snapshot,
          useAi,
          authoringSource,
          ...(authoringPrompt ? { authoringPrompt } : {}),
        }),
      );
      return { snapshot, key, data };
    },
    onSuccess: ({ snapshot, key, data }) => {
      client.setQueryData(["dialogue-preparation", data.id], data);
      setSelected({ id: data.id, snapshot, key });
    },
    onError: () => {
      if (!selected) onChange(null);
    },
  });
  const action = useMutation({
    mutationFn: async ({ name, body }: { name: string; body: unknown }) =>
      DialoguePreparationSchema.parse(
        await api.post<unknown>(`${ROOT}/${selected!.id}/${name}`, body),
      ),
    onSuccess: (data) => client.setQueryData(queryKey, data),
    onError: () => void query.refetch(),
  });
  const data = query.data;
  const saved = useQuery({
    queryKey: ["saved-dialogue-preparations"],
    queryFn: async () =>
      SavedPreparationsSchema.parse(await api.get<unknown>(ROOT)),
    enabled: false,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const snapshot = SnapshotSchema.parse(
        await api.get<unknown>(`${ROOT}/${id}/snapshot`),
      );
      if (scopeCode && snapshot.scenario.code !== scopeCode)
        throw new Error("Этот снимок относится к другому сценарию");
      const status = DialoguePreparationSchema.parse(
        await api.get<unknown>(`${ROOT}/${id}`),
      );
      return { id, snapshot, status };
    },
    onSuccess: ({ id, snapshot, status }) => {
      onRestore(snapshot);
      client.setQueryData(["dialogue-preparation", id], status);
      setSelected({
        id,
        snapshot: snapshot.scenario,
        key: scenarioPreparationKey(snapshot.scenario)!,
      });
    },
  });
  useEffect(() => {
    if (selected)
      onChange({
        id: selected.id,
        snapshotKey: selected.key,
        ready: data?.status === "ready",
      });
  }, [selected, data?.status, onChange]);
  const stale = Boolean(selected && selected.key !== currentKey);
  const busy =
    create.isPending || action.isPending || restore.isPending || disabled;
  const error =
    create.error ?? action.error ?? restore.error ?? saved.error ?? query.error;

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Подготовка диалога и голоса</Heading>
        <Text size="2" color="gray">
          Сохраним снимок заполненной формы. Вы проверите варианты вопросов
          оператора и ответы заявителя, затем утвердите озвучку. Публикация —
          отдельное действие.
        </Text>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || saved.isFetching}
          onClick={() => void saved.refetch()}
        >
          Найти мои сохранённые подготовки
        </Button>
        {saved.data && (
          <details>
            <summary>
              Сохранённые снимки (последние 20). Восстановление заменит поля
              формы.
            </summary>
            <Flex direction="column" gap="2">
              {saved.data
                .filter((item) => !scopeCode || item.code === scopeCode)
                .map((item) => (
                  <Button
                    type="button"
                    variant="soft"
                    key={item.id}
                    disabled={busy}
                    onClick={() => restore.mutate(item.id)}
                  >
                    Восстановить: {item.title} ·{" "}
                    {new Date(item.updatedAt).toLocaleString("ru-RU")}
                  </Button>
                ))}
              {saved.data.length === 0 && (
                <Text>Сохранённых подготовок пока нет.</Text>
              )}
            </Flex>
          </details>
        )}
        <Text as="label" size="2" className="flex items-center gap-2">
          <Checkbox
            checked={useAi}
            disabled={busy}
            onCheckedChange={(checked) => setUseAi(checked === true)}
          />
          Предложить варианты вопросов с помощью AI
        </Text>
        {useAi && (
          <Text size="2" color="gray">
            Вопросы будут переданы настроенному AI-провайдеру (локальному или
            облачному). Ответы, поля адреса и координаты не передаются.
            Используйте только синтетические учебные данные.
          </Text>
        )}
        {!currentKey && (
          <Text size="2" color="amber">
            Сначала заполните обязательные поля сценария и отметьте место на
            карте.
          </Text>
        )}
        {stale && (
          <Text color="amber" role="alert">
            Форма изменилась. Этот набор относится к предыдущему снимку и не
            может быть опубликован с текущими данными.
          </Text>
        )}
        <Flex gap="2" wrap="wrap">
          <Button
            type="button"
            variant="soft"
            disabled={busy || !currentKey}
            onClick={() => create.mutate()}
          >
            {create.isPending
              ? "Сохраняем снимок…"
              : selected && !stale
                ? "Восстановить состояние"
                : "Подготовить текущий сценарий"}
          </Button>
          {selected && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                onChange(null);
              }}
            >
              Продолжить без этого набора
            </Button>
          )}
        </Flex>
        {error && (
          <Text role="alert" color="red">
            {messageFrom(
              error,
              "Не удалось обновить подготовку. Попробуйте ещё раз.",
            )}
          </Text>
        )}
        {selected && data && (
          <>
            <Text role="status">
              {labels[data.status]} · {data.completed} из {data.total}{" "}
              аудиозаписей
            </Text>
            {!data.workerEnabled && (
              <Text color="amber">
                Фоновая подготовка выключена на сервере. Проверка текста
                доступна; для генерации и озвучки администратору нужно включить
                worker.
              </Text>
            )}
            {data.error === "generation_failed" && (
              <Text color="amber">
                AI недоступен или вернул некорректный ответ. Оставлены исходные
                вопросы — их можно проверить вручную.
              </Text>
            )}
            {data.error === "synthesis_failed" && (
              <Text color="amber">
                Озвучка прервалась. Готовые записи сохранены; продолжение не
                начнёт работу заново.
              </Text>
            )}
            {data.status === "review" && (
              <DialoguePreparationReview
                key={`${data.id}:${data.revision}`}
                data={data}
                snapshot={selected.snapshot}
                disabled={busy || stale}
                onSave={(entries) =>
                  action.mutate({
                    name: "review",
                    body: { revision: data.revision, entries },
                  })
                }
                onApprove={() =>
                  action.mutate({
                    name: "approve",
                    body: { revision: data.revision },
                  })
                }
              />
            )}
            {[
              "queued",
              "generating",
              "synthesizing",
              "ready",
              "failed",
            ].includes(data.status) && (
              <Button
                type="button"
                variant="soft"
                disabled={busy || stale}
                onClick={() =>
                  action.mutate({
                    name: "reopen",
                    body: { revision: data.revision },
                  })
                }
              >
                Вернуться к проверке текста
              </Button>
            )}
            {data.status === "failed" && (
              <Button
                type="button"
                disabled={busy || stale || !data.workerEnabled}
                onClick={() =>
                  action.mutate({
                    name: "retry",
                    body: { revision: data.revision },
                  })
                }
              >
                Продолжить озвучку
              </Button>
            )}
            {data.status === "ready" && !stale && (
              <Text color="green">
                Набор утверждён и озвучен. Кнопка публикации ниже закрепит его
                за новой версией.
              </Text>
            )}
            {data.previews.some((item) => item.ready) && (
              <DialogueAudioPreview
                key={selected.id}
                id={selected.id}
                previews={data.previews}
              />
            )}
          </>
        )}
      </Flex>
    </Card>
  );
}
