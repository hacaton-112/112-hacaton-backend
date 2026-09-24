import { Button, Callout, Flex, Skeleton, Text, toast } from "@bolid-ui/themes";
import { AlertTriangle, Download, Plus, Sparkles, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { ScenarioAiHelper } from "../../components/scenario-authoring/scenario-ai-helper";
import { ScenarioCatalogTable } from "../../components/scenario-catalog/scenario-catalog-table";
import { scenarioCountLabel } from "../../components/scenario-catalog/scenario-catalog-formatters";
import { ScenarioDeleteDialog } from "../../components/scenario-catalog/scenario-delete-dialog";
import { ScenarioPackageDialog } from "../../components/scenario-catalog/scenario-package-dialog";
import type { ScenarioSummary } from "../../contracts/call";
import type { ScenarioGenerationJob } from "../../contracts/scenario-authoring";
import { useScenarioAuthoring } from "../../hooks/use-scenario-authoring";
import { useScenarioGenerationJobs } from "../../hooks/use-scenario-generation";
import { useScenarioVersion } from "../../hooks/use-scenario-version";
import { useScenarios } from "../../hooks/use-scenarios";
import { ROUTES } from "../../config/routes";
import { scenarioService } from "../../services/scenario.service";

const messageFrom = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось поставить черновик в очередь";

/**
 * Учебные сценарии: таблица опубликованных и действия по каждому.
 *
 * Запуск, правка и удаление живут в самой строке — как в остальных таблицах
 * приложения. Черновики помощника готовятся в фоне и стоят строками сверху.
 */
export default function ScenarioCatalogPage() {
  const navigate = useNavigate();
  const scenarios = useScenarios();
  const list = scenarios.data ?? [];
  const { archival } = useScenarioAuthoring();
  const generation = useScenarioGenerationJobs();
  const [removing, setRemoving] = useState<ScenarioSummary>();
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperError, setHelperError] = useState<string>();
  const [packageOpen, setPackageOpen] = useState(false);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // Идентификатор сценария известен только его версии: в списке его нет.
  const version = useScenarioVersion(removing?.scenarioVersionId);

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

  const start = useCallback(
    (scenario: ScenarioSummary) =>
      navigate(ROUTES.operatorWithScenario(scenario.scenarioVersionId)),
    [navigate],
  );
  const edit = useCallback(
    (scenario: ScenarioSummary) =>
      navigate(ROUTES.scenarioEdit(scenario.scenarioVersionId)),
    [navigate],
  );
  const remove = useCallback(
    (scenario: ScenarioSummary) => {
      archival.reset();
      setRemoving(scenario);
    },
    [archival],
  );

  const confirmRemoval = async () => {
    if (!removing || !version.data) return;

    try {
      await archival.mutateAsync(version.data.scenarioId);
      toast.success("Сценарий удалён", {
        description: `${removing.code} · ${removing.title}`,
      });
      setRemoving(undefined);
    } catch {
      // Причина остаётся в диалоге: преподаватель может повторить или отменить.
    }
  };

  const exportPackage = async () => {
    setExporting(true);
    try {
      const filename = await scenarioService.exportPackage(selectedVersionIds);
      toast.success("Сценарии выгружены", { description: filename });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось выгрузить сценарии",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <main
      aria-label="Учебные сценарии"
      className="flex h-full min-h-full min-w-0 flex-col gap-3 p-4"
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
            disabled={exporting}
            onClick={() => void exportPackage()}
          >
            <Download size={16} />
            {selectedVersionIds.length > 0
              ? `Выгрузить (${selectedVersionIds.length})`
              : "Выгрузить"}
          </Button>
          <Button size="2" variant="soft" onClick={() => setPackageOpen(true)}>
            <Upload size={16} /> Загрузить
          </Button>
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
              onStart={start}
              onEdit={edit}
              onDelete={remove}
              onOpenDraft={openDraft}
              onRetry={retry}
              onDismiss={dismiss}
              onSelectionChange={setSelectedVersionIds}
            />
          )}
        </div>
      )}

      {removing && (
        <ScenarioDeleteDialog
          open
          onOpenChange={(open) => !open && setRemoving(undefined)}
          code={removing.code}
          title={removing.title}
          pending={archival.isPending || version.isPending}
          error={archival.error?.message}
          onConfirm={() => void confirmRemoval()}
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
      <ScenarioPackageDialog
        open={packageOpen}
        onOpenChange={setPackageOpen}
        onImported={() => void scenarios.refetch()}
      />
    </main>
  );
}
