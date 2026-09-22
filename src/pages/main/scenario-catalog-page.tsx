import {
  Button,
  Callout,
  Card,
  Flex,
  Skeleton,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Plus, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ScenarioAiHelper } from "../../components/scenario-authoring/scenario-ai-helper";
import { ScenarioBriefingPanel } from "../../components/scenario-catalog/scenario-briefing-panel";
import { ScenarioCatalogTable } from "../../components/scenario-catalog/scenario-catalog-table";
import { scenarioCountLabel } from "../../components/scenario-catalog/scenario-catalog-formatters";
import { ScenarioDeleteDialog } from "../../components/scenario-catalog/scenario-delete-dialog";
import type { ScenarioGenerationJob } from "../../contracts/scenario-authoring";
import { useScenarioAuthoring } from "../../hooks/use-scenario-authoring";
import { useScenarioGenerationJobs } from "../../hooks/use-scenario-generation";
import { useScenarioVersion } from "../../hooks/use-scenario-version";
import { useScenarios } from "../../hooks/use-scenarios";
import { ROUTES } from "../../config/routes";

const messageFrom = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось поставить черновик в очередь";

/**
 * Учебные сценарии: таблица опубликованных, брифинг выбранного и правка.
 *
 * Выбор живёт в адресе: после публикации правки конструктор возвращает сюда
 * уже на новую версию, и она сразу открыта в брифинге. Черновики помощника
 * готовятся в фоне и стоят в таблице строками со статусом.
 */
export default function ScenarioCatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scenarios = useScenarios();
  const list = scenarios.data ?? [];
  const requested = searchParams.get("selected");
  const selected =
    list.find((scenario) => scenario.scenarioVersionId === requested) ??
    list[0];
  const version = useScenarioVersion(selected?.scenarioVersionId);
  const { archival } = useScenarioAuthoring();
  const generation = useScenarioGenerationJobs();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperError, setHelperError] = useState<string>();

  const select = useCallback(
    (scenarioVersionId: string) =>
      setSearchParams({ selected: scenarioVersionId }, { replace: true }),
    [setSearchParams],
  );

  const enqueue = async (brief: string) => {
    setHelperError(undefined);
    try {
      await generation.enqueue.mutateAsync(brief);
      setHelperOpen(false);
      toast.success("Черновик поставлен в очередь", {
        description:
          "Он появится в таблице, как только помощник закончит. Страницу можно закрыть.",
      });
    } catch (error) {
      setHelperError(messageFrom(error));
    }
  };

  const openDraft = useCallback(
    (job: ScenarioGenerationJob) =>
      navigate(`${ROUTES.scenarioNew()}?job=${encodeURIComponent(job.id)}`),
    [navigate],
  );
  const { mutate: enqueueAgain } = generation.enqueue;
  const { mutate: dismissJob } = generation.dismiss;
  const retry = useCallback(
    (job: ScenarioGenerationJob) => {
      enqueueAgain(job.brief, {
        onSuccess: () => dismissJob(job.id),
        onError: (error) => toast.error(messageFrom(error)),
      });
    },
    [dismissJob, enqueueAgain],
  );
  const dismiss = useCallback(
    (job: ScenarioGenerationJob) => dismissJob(job.id),
    [dismissJob],
  );

  const openDeleteDialog = () => {
    archival.reset();
    setDeleteOpen(true);
  };

  const deleteSelected = async () => {
    if (!selected || !version.data) return;

    try {
      await archival.mutateAsync(version.data.scenarioId);
      setDeleteOpen(false);
      // Выбор сбрасывается на первый оставшийся сценарий.
      setSearchParams({}, { replace: true });
      toast.success("Сценарий удалён", {
        description: `${selected.code} · ${selected.title}`,
      });
    } catch {
      // Причина остаётся в диалоге: преподаватель может повторить или отменить.
    }
  };

  return (
    <div className="scenario-catalog-page h-full min-h-full">
      <div className="scenario-catalog-layout grid min-h-full gap-4 p-4">
        <section
          aria-label="Учебные сценарии"
          className="flex min-h-[480px] min-w-0 flex-col gap-3"
        >
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Text size="2" color="gray">
              {scenarios.data
                ? scenarioCountLabel(list.length)
                : "Загрузка сценариев…"}
            </Text>
            <Flex gap="2">
              <Button
                size="2"
                variant="soft"
                onClick={() => navigate(ROUTES.scenarioNew())}
              >
                <Plus size={16} />
                Создать вручную
              </Button>
              <Button
                size="2"
                onClick={() => {
                  setHelperError(undefined);
                  setHelperOpen(true);
                }}
              >
                <Sparkles size={16} />
                Сгенерировать с ИИ
              </Button>
            </Flex>
          </Flex>

          {/* Упавшее фоновое обновление не прячет уже загруженный список. */}
          {scenarios.error && !scenarios.data ? (
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                Не удалось получить список сценариев: {scenarios.error.message}{" "}
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={() => void scenarios.refetch()}
                >
                  Повторить
                </Button>
              </Callout.Text>
            </Callout.Root>
          ) : (
            <div className="min-h-0 flex-1">
              {scenarios.isPending ? (
                <Skeleton height="100%" className="rounded-(--radius-4)" />
              ) : (
                <ScenarioCatalogTable
                  scenarios={list}
                  jobs={generation.jobs.data ?? []}
                  selectedId={selected?.scenarioVersionId}
                  onSelect={select}
                  onOpenDraft={openDraft}
                  onRetry={retry}
                  onDismiss={dismiss}
                />
              )}
            </div>
          )}
        </section>

        {selected ? (
          <ScenarioBriefingPanel
            summary={selected}
            version={version.data}
            isPending={version.isPending}
            error={version.error}
            onRetry={() => void version.refetch()}
            onCreate={() => navigate(ROUTES.scenarioNew())}
            onStart={() =>
              navigate(ROUTES.operatorWithScenario(selected.scenarioVersionId))
            }
            onEdit={() =>
              navigate(ROUTES.scenarioEdit(selected.scenarioVersionId))
            }
            onDelete={openDeleteDialog}
          />
        ) : (
          !scenarios.isPending &&
          !(scenarios.error && !scenarios.data) && (
            <Card size="3" variant="classic" className="grid gap-4 self-start">
              <Text as="p" size="2" color="gray">
                Опубликуйте первый сценарий — здесь появится его брифинг: кто
                звонит, порог оценки и обязательные вопросы.
              </Text>
            </Card>
          )
        )}
        {selected && (
          <ScenarioDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            code={selected.code}
            title={selected.title}
            pending={archival.isPending}
            error={archival.error?.message}
            onConfirm={() => void deleteSelected()}
          />
        )}
        <ScenarioAiHelper
          open={helperOpen}
          onOpenChange={setHelperOpen}
          pending={generation.enqueue.isPending}
          error={helperError}
          onErrorDismiss={() => setHelperError(undefined)}
          onGenerate={(brief) => void enqueue(brief)}
        />
      </div>
    </div>
  );
}
