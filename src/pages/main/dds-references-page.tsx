import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  Flex,
  Heading,
  Select,
  Text,
} from "@bolid-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCheck, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { DdsReferenceEditor } from "../../components/dds/dds-reference-editor";
import { QUERY_KEYS } from "../../config/query-keys";
import type {
  DdsReferenceListItem,
  DdsReferenceStatus,
} from "../../contracts/dds-reference";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { ddsReferenceService } from "../../services/dds-reference.service";

const STATUS_LABELS = {
  missing: "Нет эталона",
  draft: "Черновик",
  approved: "Подтверждён",
} as const;

export default function DdsReferencesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DdsReferenceStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const filters = {
    status: status === "all" ? undefined : status,
    page,
    pageSize: 25,
  };
  const references = useQuery({
    queryKey: QUERY_KEYS.ddsReferences(filters),
    queryFn: () => ddsReferenceService.list(filters),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (item) =>
          item.jobStatus === "pending" || item.jobStatus === "processing",
      )
        ? 2_000
        : false,
  });
  const bulk = useMutation({
    mutationFn: (kind: "approve" | "regenerate") =>
      kind === "approve"
        ? ddsReferenceService.approveMany([...selected])
        : ddsReferenceService.regenerateMany([...selected]),
    onSuccess: (result) => {
      setRejected(result.rejected.map(({ reason }) => reason));
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["dds-references"] });
    },
  });
  const columns = useMemo<ColDef<DdsReferenceListItem>[]>(
    () => [
      {
        colId: "selected",
        headerName: "",
        width: 48,
        sortable: false,
        cellRenderer: ({ data }: ICellRendererParams<DdsReferenceListItem>) =>
          data ? (
            <input
              aria-label={`Выбрать ${data.title}`}
              type="checkbox"
              checked={selected.has(data.scenarioVersionId)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(data.scenarioVersionId);
                  else next.delete(data.scenarioVersionId);
                  return next;
                })
              }
            />
          ) : null,
      },
      { field: "code", headerName: "Код", width: 130 },
      { field: "title", headerName: "Сценарий", flex: 1, minWidth: 220 },
      { field: "category", headerName: "Категория", width: 150 },
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
  const pages = Math.max(1, Math.ceil((references.data?.total ?? 0) / 25));

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
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
            setStatus(value as typeof status);
            setPage(1);
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
      {(references.error || bulk.error) && (
        <Callout.Root color="red">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            {references.error?.message ?? bulk.error?.message}
          </Callout.Text>
        </Callout.Root>
      )}
      <Card size="1" className="min-h-96">
        <DataTableReact<DdsReferenceListItem>
          {...DATA_TABLE_DEFAULTS}
          rowData={references.data?.items ?? []}
          columnDefs={columns}
          getRowId={({ data }) => data.scenarioVersionId}
          onRowClicked={({ data }) => data && setOpened(data.scenarioVersionId)}
        />
      </Card>
      <Flex justify="between" align="center">
        <Button
          variant="soft"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Назад
        </Button>
        <Text size="2">
          Страница {page} из {pages}
        </Text>
        <Button
          variant="soft"
          disabled={page >= pages}
          onClick={() => setPage((value) => value + 1)}
        >
          Далее
        </Button>
      </Flex>
      <Dialog.Root
        open={opened !== null}
        onOpenChange={(open) => !open && setOpened(null)}
      >
        <Dialog.Content maxWidth="760px">
          <Dialog.Title>Редактирование эталона</Dialog.Title>
          {opened && <DdsReferenceEditor versionId={opened} />}
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}
