import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  GridApi,
  ICellRendererParams,
  RowClassParams,
} from "@bolid-ui/data-table/community";
import { Button, Flex, Spinner, Text } from "@bolid-ui/themes";
import { AlertTriangle, FilePlus2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScenarioSummary } from "../../contracts/call";
import type { ScenarioGenerationJob } from "../../contracts/scenario-authoring";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import {
  CategoryChip,
  CodeChip,
  DifficultyDots,
} from "./scenario-catalog-chips";
import { formatClock } from "./scenario-catalog-formatters";

/** Строка таблицы: опубликованный сценарий или черновик, который готовится. */
type CatalogRow =
  | { kind: "scenario"; id: string; scenario: ScenarioSummary }
  | { kind: "job"; id: string; job: ScenarioGenerationJob };

interface ScenarioCatalogTableProps {
  scenarios: ScenarioSummary[];
  jobs: ScenarioGenerationJob[];
  selectedId?: string;
  onSelect: (scenarioVersionId: string) => void;
  onOpenDraft: (job: ScenarioGenerationJob) => void;
  onRetry: (job: ScenarioGenerationJob) => void;
  onDismiss: (job: ScenarioGenerationJob) => void;
}

/**
 * Каталог сценариев таблицей.
 *
 * Черновики помощника стоят закреплёнными строками сверху: сортировка их не
 * уносит, а пока модель пишет, строка показывает очередь и ход генерации.
 */
export function ScenarioCatalogTable({
  scenarios,
  jobs,
  selectedId,
  onSelect,
  onOpenDraft,
  onRetry,
  onDismiss,
}: ScenarioCatalogTableProps) {
  const gridApi = useRef<GridApi<CatalogRow> | null>(null);
  // Класс строки таблица считает при отрисовке: смена выбора её не трогает,
  // поэтому обводка переносится явной перерисовкой.
  useEffect(() => {
    gridApi.current?.redrawRows();
  }, [selectedId]);

  const rows = useMemo<CatalogRow[]>(
    () =>
      scenarios.map((scenario) => ({
        kind: "scenario",
        id: scenario.scenarioVersionId,
        scenario,
      })),
    [scenarios],
  );
  const jobRows = useMemo<CatalogRow[]>(
    () => jobs.map((job) => ({ kind: "job", id: `job:${job.id}`, job })),
    [jobs],
  );

  const columnDefs = useMemo<ColDef<CatalogRow>[]>(
    () => [
      {
        colId: "code",
        headerName: "Код",
        flex: 0,
        width: 100,
        valueGetter: ({ data }) =>
          data?.kind === "scenario" ? data.scenario.code : "",
        cellRenderer: ({ data }: ICellRendererParams<CatalogRow>) =>
          data?.kind === "scenario" ? (
            <CodeChip code={data.scenario.code} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[6px] bg-(--violet-a3) px-2.5 py-1 text-xs font-semibold text-(--violet-11)">
              <Sparkles size={12} aria-hidden />
              ИИ
            </span>
          ),
      },
      {
        colId: "title",
        headerName: "Сценарий",
        flex: 3,
        minWidth: 260,
        // Черновику остальные колонки не нужны: его описание, статус и кнопки
        // занимают всю ширину, и таблица не уезжает вбок рядом с брифингом.
        colSpan: ({ data }) => (data?.kind === "job" ? 3 : 1),
        valueGetter: ({ data }) =>
          data?.kind === "scenario" ? data.scenario.title : "",
        tooltipValueGetter: ({ data }) =>
          data?.kind === "scenario" ? data.scenario.summary : data?.job.brief,
        cellRenderer: ({ data }: ICellRendererParams<CatalogRow>) =>
          data?.kind === "job" ? (
            <JobTitle
              job={data.job}
              onOpen={onOpenDraft}
              onRetry={onRetry}
              onDismiss={onDismiss}
            />
          ) : data ? (
            <Text weight="medium" className="truncate">
              {data.scenario.title}
            </Text>
          ) : null,
      },
      {
        colId: "category",
        headerName: "Категория",
        minWidth: 150,
        valueGetter: ({ data }) =>
          data?.kind === "scenario" ? data.scenario.category : "",
        cellRenderer: ({ data }: ICellRendererParams<CatalogRow>) =>
          data?.kind === "scenario" ? (
            <CategoryChip category={data.scenario.category} />
          ) : null,
      },
      {
        colId: "difficulty",
        headerName: "Сложность",
        flex: 0,
        width: 110,
        valueGetter: ({ data }) =>
          data?.kind === "scenario" ? data.scenario.difficulty : null,
        cellRenderer: ({ data }: ICellRendererParams<CatalogRow>) =>
          data?.kind === "scenario" ? (
            <Flex align="center" height="100%">
              <DifficultyDots level={data.scenario.difficulty} />
            </Flex>
          ) : null,
      },
    ],
    [onDismiss, onOpenDraft, onRetry],
  );

  return (
    <DataTableReact<CatalogRow>
      {...DATA_TABLE_DEFAULTS}
      rowData={rows}
      pinnedTopRowData={jobRows}
      columnDefs={columnDefs}
      getRowId={({ data }) => data.id}
      onGridReady={({ api }) => {
        gridApi.current = api;
      }}
      tooltipShowDelay={400}
      // У черновика две строки: описание и ход генерации.
      getRowHeight={({ data }) => (data?.kind === "job" ? 56 : undefined)}
      overlayNoRowsTemplate="Опубликованных сценариев пока нет"
      getRowClass={({ data }: RowClassParams<CatalogRow>) =>
        data?.kind === "job"
          ? "scenario-row--job"
          : data?.id === selectedId
            ? "scenario-row--selected"
            : undefined
      }
      onRowClicked={({ data }) => {
        if (data?.kind === "scenario") onSelect(data.id);
      }}
    />
  );
}

/** Сколько идёт генерация: секунды тикают, пока модель пишет. */
function useElapsed(since: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since ? formatClock((now - new Date(since).getTime()) / 1_000) : null;
}

function JobTitle({
  job,
  onOpen,
  onRetry,
  onDismiss,
}: {
  job: ScenarioGenerationJob;
  onOpen: (job: ScenarioGenerationJob) => void;
  onRetry: (job: ScenarioGenerationJob) => void;
  onDismiss: (job: ScenarioGenerationJob) => void;
}) {
  const elapsed = useElapsed(job.status === "running" ? job.startedAt : null);
  const status =
    job.status === "queued"
      ? `В очереди${job.queuePosition ? `, № ${job.queuePosition}` : ""}`
      : job.status === "running"
        ? `Помощник пишет черновик · ${elapsed ?? "00:00"}`
        : job.status === "done"
          ? "Черновик готов — откройте и проверьте перед публикацией"
          : (job.error?.message ?? "Не удалось подготовить черновик");

  return (
    <Flex align="center" gap="3" className="h-full min-w-0">
      {job.status === "queued" || job.status === "running" ? (
        <Spinner size="2" />
      ) : job.status === "failed" ? (
        <AlertTriangle size={16} className="shrink-0 text-(--red-10)" />
      ) : (
        <FilePlus2 size={16} className="shrink-0 text-(--green-10)" />
      )}
      <div className="grid min-w-0 leading-tight">
        <Text size="2" weight="medium" className="truncate">
          {job.brief}
        </Text>
        <Text
          size="1"
          color={job.status === "failed" ? "red" : "gray"}
          className="truncate"
        >
          {status}
        </Text>
      </div>
      {job.status === "queued" || job.status === "running" ? (
        <div
          className="scenario-job-progress ml-auto h-1 w-24 shrink-0 overflow-hidden rounded-full bg-(--gray-a4)"
          aria-hidden
        >
          <div className="h-full w-1/3 rounded-full bg-(--violet-9)" />
        </div>
      ) : (
        <div className="ml-auto shrink-0">
          <JobActions
            job={job}
            onOpen={onOpen}
            onRetry={onRetry}
            onDismiss={onDismiss}
          />
        </div>
      )}
    </Flex>
  );
}

function JobActions({
  job,
  onOpen,
  onRetry,
  onDismiss,
}: {
  job: ScenarioGenerationJob;
  onOpen: (job: ScenarioGenerationJob) => void;
  onRetry: (job: ScenarioGenerationJob) => void;
  onDismiss: (job: ScenarioGenerationJob) => void;
}) {
  if (job.status === "queued" || job.status === "running") return null;

  return (
    <Flex align="center" gap="2" justify="end" className="h-full">
      {job.status === "done" ? (
        <Button size="1" onClick={() => onOpen(job)}>
          <FilePlus2 size={13} />
          Открыть черновик
        </Button>
      ) : (
        <Button size="1" variant="soft" onClick={() => onRetry(job)}>
          <RotateCcw size={13} />
          Повторить
        </Button>
      )}
      <Button
        size="1"
        variant="ghost"
        color="gray"
        aria-label="Убрать из списка"
        onClick={() => onDismiss(job)}
      >
        <X size={14} />
      </Button>
    </Flex>
  );
}
