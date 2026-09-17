import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  Flex,
  Heading,
  Skeleton,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, FileSearch } from "lucide-react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type { CallSummary } from "../../contracts/debrief";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { formatDateTime } from "../training/training-labels";
import { formatDuration } from "./debrief-formatters";

interface DebriefCallListProps {
  calls?: CallSummary[];
  isPending: boolean;
  error: Error | null;
}

export function DebriefCallList({
  calls,
  isPending,
  error,
}: DebriefCallListProps) {
  const navigate = useNavigate();

  const columnDefs: ColDef<CallSummary>[] = [
    {
      field: "offeredAt",
      headerName: "Дата и время",
      minWidth: 160,
      sort: "desc",
      valueFormatter: ({ value }) => (value ? formatDateTime(value) : "—"),
    },
    {
      colId: "scenario",
      headerName: "Сценарий",
      flex: 2,
      minWidth: 240,
      valueGetter: ({ data }) =>
        data ? `${data.scenarioCode} · ${data.title}` : "",
    },
    {
      field: "durationSeconds",
      headerName: "Длительность разговора",
      minWidth: 170,
      valueFormatter: ({ value }) =>
        value === null ? "—" : formatDuration(value),
    },
    {
      field: "stage",
      headerName: "Статус",
      minWidth: 130,
      cellRenderer: ({ data }: ICellRendererParams<CallSummary>) =>
        data && (
          <Badge
            color={data.stage === "ended" ? "gray" : "amber"}
            variant="soft"
          >
            {data.stage === "declined" ? "Отклонён" : "Завершён"}
          </Badge>
        ),
    },
    {
      ...ACTION_COLUMN,
      width: 120,
      cellRenderer: ({ data }: ICellRendererParams<CallSummary>) =>
        data && (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              onClick={() =>
                navigate(ROUTES.debriefSession(data.trainingSessionId))
              }
            >
              <FileSearch size={14} /> Разбор
            </Button>
          </Flex>
        ),
    },
  ];

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="6">Разбор звонков</Heading>
          <Text as="p" size="2" color="gray">
            История совершённых тренировочных звонков и детальный разбор действий.
          </Text>
        </div>
      </Flex>

      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить список вызовов: {error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {isPending ? (
          <Skeleton height="100%" className="rounded-xl" />
        ) : (
          <DataTableReact<CallSummary>
            {...DATA_TABLE_DEFAULTS}
            rowData={calls ?? []}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.trainingSessionId}
            overlayNoRowsTemplate="Проведённых вызовов пока нет"
            onRowDoubleClicked={({ data }) => {
              if (data) {
                navigate(ROUTES.debriefSession(data.trainingSessionId));
              }
            }}
          />
        )}
      </div>
    </main>
  );
}
