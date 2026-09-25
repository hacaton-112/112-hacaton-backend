import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import { Badge, Card, Heading, Text } from "@bolid-ui/themes";
import { useQuery } from "@tanstack/react-query";

import { API_CONFIG } from "../../config/api";
import { QUERY_KEYS } from "../../config/query-keys";
import {
  AdminQueuesSchema,
  type AdminQueue,
} from "../../contracts/admin-queues";
import { api } from "../../lib/api";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";

const LABELS: Record<AdminQueue["name"], string> = {
  scenario_generation: "Генерация сценариев",
  dds_reference_generation: "Эталоны ДДС",
  dds_text_evaluation: "Оценка текста ДДС",
  dds_insights: "Выводы по занятиям",
};

const columns: ColDef<AdminQueue>[] = [
  {
    field: "name",
    headerName: "Очередь",
    flex: 1,
    minWidth: 210,
    valueFormatter: ({ value }) => LABELS[value as AdminQueue["name"]],
  },
  { field: "queued", headerName: "Ожидают", width: 110 },
  { field: "processing", headerName: "В работе", width: 110 },
  { field: "failed", headerName: "Ошибки", width: 100 },
  {
    field: "oldestAt",
    headerName: "Самая старая",
    width: 190,
    valueFormatter: ({ value }) =>
      value ? new Date(String(value)).toLocaleString("ru-RU") : "—",
  },
  {
    field: "enabled",
    headerName: "Состояние",
    width: 120,
    cellRenderer: ({ data }: ICellRendererParams<AdminQueue>) =>
      data ? (
        <Badge color={data.enabled ? "green" : "gray"}>
          {data.enabled ? "Работает" : "Выключена"}
        </Badge>
      ) : null,
  },
];

export function BackgroundQueuesCard() {
  const query = useQuery({
    queryKey: QUERY_KEYS.adminQueues(),
    queryFn: async () =>
      AdminQueuesSchema.parse(
        await api.get<unknown>(API_CONFIG.getAdminQueuesUrl()),
      ),
    refetchInterval: 3_000,
  });
  return (
    <Card size="2" className="grid gap-3">
      <div>
        <Heading size="4">Фоновые очереди</Heading>
        <Text color="gray" size="2">
          Обновляются автоматически каждые три секунды.
        </Text>
      </div>
      {query.error ? (
        <Text color="red">
          Не удалось получить очереди: {query.error.message}
        </Text>
      ) : (
        <div className="h-64">
          <DataTableReact<AdminQueue>
            {...DATA_TABLE_DEFAULTS}
            rowData={query.data?.queues ?? []}
            columnDefs={columns}
            getRowId={({ data }) => data.name}
          />
        </div>
      )}
    </Card>
  );
}
