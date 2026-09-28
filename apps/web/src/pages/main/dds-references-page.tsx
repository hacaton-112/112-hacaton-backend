import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  GridApi,
  ICellRendererParams,
  IDatasource,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  Select,
  Text,
} from "@bolid-ui/themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCheck, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DdsReferenceEditor } from "../../components/dds/dds-reference-editor";
import type {
  DdsReferenceListItem,
  DdsReferenceStatus,
} from "../../contracts/dds-reference";
import { CATEGORY_LABELS } from "../../contracts/scenario-authoring";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { labelFor } from "../../lib/labels";
import { ddsReferenceService } from "../../services/dds-reference.service";

const STATUS_LABELS = {
  missing: "Нет эталона",
  draft: "Черновик",
  approved: "Подтверждён",
} as const;

export default function DdsReferencesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DdsReferenceStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [gridApi, setGridApi] = useState<GridApi<DdsReferenceListItem> | null>(
    null,
  );
  const [generatingBlocks, setGeneratingBlocks] = useState<Set<number>>(
    new Set(),
  );
  const bulk = useMutation({
    mutationFn: (kind: "approve" | "regenerate") =>
      kind === "approve"
        ? ddsReferenceService.approveMany([...selected])
        : ddsReferenceService.regenerateMany([...selected]),
    onSuccess: (result) => {
      setRejected(result.rejected.map(({ reason }) => reason));
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["dds-references"] });
      gridApi?.purgeInfiniteCache();
    },
  });
  const datasource = useMemo<IDatasource>(
    () => ({
      getRows: async ({ startRow, endRow, successCallback, failCallback }) => {
        const pageSize = endRow - startRow;

        try {
          const result = await ddsReferenceService.list({
            status: status === "all" ? undefined : status,
            page: Math.floor(startRow / pageSize) + 1,
            pageSize,
          });

          setLoadError(null);
          setGeneratingBlocks((current) => {
            const next = new Set(current);
            const isGenerating = result.items.some(
              (item) =>
                item.jobStatus === "pending" || item.jobStatus === "processing",
            );
            if (isGenerating) next.add(startRow);
            else next.delete(startRow);
            return next;
          });
          successCallback(result.items, result.total);
        } catch (error) {
          setLoadError(
            error instanceof Error
              ? error
              : new Error("Не удалось загрузить эталоны"),
          );
          failCallback();
        }
      },
    }),
    [status],
  );

  useEffect(() => {
    if (!gridApi || generatingBlocks.size === 0) return;

    const interval = window.setInterval(
      () => gridApi.refreshInfiniteCache(),
      2_000,
    );
    return () => window.clearInterval(interval);
  }, [generatingBlocks.size, gridApi]);
  const columns = useMemo<ColDef<DdsReferenceListItem>[]>(
    () => [
      {
        colId: "selected",
        headerName: "",
        width: 48,
        sortable: false,
        cellRenderer: ({ data }: ICellRendererParams<DdsReferenceListItem>) =>
          data ? (
            <Flex align="center" justify="center" height="100%">
              <Checkbox
                aria-label={`Выбрать ${data.title}`}
                checked={selected.has(data.scenarioVersionId)}
                // Клик по ячейке иначе дойдёт до строки и откроет редактор эталона.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(checked) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked === true) next.add(data.scenarioVersionId);
                    else next.delete(data.scenarioVersionId);
                    return next;
                  })
                }
              />
            </Flex>
          ) : null,
      },
      { field: "code", headerName: "Код", width: 130 },
      { field: "title", headerName: "Сценарий", flex: 1, minWidth: 220 },
      {
        field: "category",
        headerName: "Категория",
        width: 180,
        valueFormatter: ({ value }) => labelFor(CATEGORY_LABELS, value, "Прочее"),
      },
      {
        field: "status",
        headerName: "Эталон",
        width: 160,
        cellRenderer: ({ data }: ICellRendererParams<DdsReferenceListItem>) =>
          data ? (
            <Badge color={data.status === "approved" ? "green" : "amber"}>
              {STATUS_LABELS[data.status]}
            </Badge>
          ) : null,
      },
      {
        colId: "progress",
        headerName: "Пункты",
        width: 110,
        valueGetter: ({ data }) =>
          data ? `${data.approvedItems}/${data.totalItems}` : "",
      },
      {
        field: "jobStatus",
        headerName: "Генерация",
        width: 140,
        valueFormatter: ({ value }) =>
          value === "processing"
            ? "В работе"
            : value === "pending"
              ? "В очереди"
              : value === "failed"
                ? "Ошибка"
                : "Готово",
      },
    ],
    [selected],
  );
  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div>
        <Heading size="6">Эталоны карточек ДДС</Heading>
        <Text as="p" color="gray" size="2" mt="1">
          Проверяйте эталоны опубликованных сценариев до начала занятия.
        </Text>
      </div>
      <Flex gap="3" wrap="wrap" align="center">
        <Select.Root
          value={status}
          onValueChange={(value) => {
            setGeneratingBlocks(new Set());
            setStatus(value as typeof status);
          }}
        >
          <Select.Trigger className="min-w-48" />
          <Select.Content>
            <Select.Item value="all">Все статусы</Select.Item>
            <Select.Item value="missing">Без эталона</Select.Item>
            <Select.Item value="draft">Черновики</Select.Item>
            <Select.Item value="approved">Подтверждённые</Select.Item>
          </Select.Content>
        </Select.Root>
        <Button
          disabled={selected.size === 0 || bulk.isPending}
          onClick={() => bulk.mutate("approve")}
        >
          <CheckCheck size={16} /> Подтвердить выбранные
        </Button>
        <Button
          variant="soft"
          disabled={selected.size === 0 || bulk.isPending}
          onClick={() => bulk.mutate("regenerate")}
        >
          <RefreshCw size={16} /> Перегенерировать
        </Button>
        <Text size="2" color="gray">
          Выбрано: {selected.size}
        </Text>
      </Flex>
      {rejected.length > 0 && (
        <Callout.Root color="amber">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{rejected.join("; ")}</Callout.Text>
        </Callout.Root>
      )}
      {(loadError || bulk.error) && (
        <Callout.Root color="red">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            {loadError?.message ?? bulk.error?.message}
          </Callout.Text>
        </Callout.Root>
      )}
      <div className="min-h-0 flex-1">
        <DataTableReact<DdsReferenceListItem>
          key={status}
          {...DATA_TABLE_DEFAULTS}
          columnDefs={columns}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={25}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[25, 50, 100]}
          getRowId={({ data }) => data.scenarioVersionId}
          onGridReady={({ api }) => setGridApi(api)}
          onRowClicked={({ data, event }) => {
            const target = event?.target;
            if (
              target instanceof Element &&
              target.closest("input, button, a, [role='button']")
            ) {
              return;
            }
            if (data) setOpened(data.scenarioVersionId);
          }}
        />
      </div>
      <Dialog.Root
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpened(null);
            gridApi?.purgeInfiniteCache();
          }
        }}
      >
        <Dialog.Content maxWidth="760px">
          <Dialog.Title>Редактирование эталона</Dialog.Title>
          {opened && <DdsReferenceEditor versionId={opened} />}
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}
