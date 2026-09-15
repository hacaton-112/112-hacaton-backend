import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import { Badge, Button, Flex, Text } from "@bolid-ui/themes";
import { FileSearch } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type { InstructorCall } from "../../contracts/training";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import {
  ATTEMPT_STATUS_COLORS,
  ATTEMPT_STATUS_LABELS,
  callVerdict,
  formatDateTime,
  formatDuration,
} from "./training-labels";

interface InstructorCallsTableProps {
  backLabel: string;
  calls: InstructorCall[];
  showOperator?: boolean;
}

/** Общая таблица результатов: из мониторинга и из карточки ученика. */
export function InstructorCallsTable({
  backLabel,
  calls,
  showOperator = false,
}: InstructorCallsTableProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const columnDefs: ColDef<InstructorCall>[] = [
    {
      field: "offeredAt",
      headerName: "Дата",
      minWidth: 160,
      sort: "desc",
      valueFormatter: ({ value }) => formatDateTime(value),
    },
    { field: "assignmentTitle", headerName: "Занятие", flex: 2, minWidth: 180 },
    {
      colId: "scenario",
      headerName: "Сценарий",
      flex: 2,
      minWidth: 180,
      valueGetter: ({ data }) =>
        data ? `${data.scenarioCode} · ${data.title}` : null,
    },
    {
      field: "groupName",
      headerName: "Группа",
      flex: 1,
      minWidth: 140,
      valueFormatter: ({ value }) => value ?? "Индивидуально",
    },
    {
      field: "attemptNumber",
      headerName: "Попытка",
      minWidth: 100,
      valueFormatter: ({ value }) => `№ ${value}`,
    },
    {
      field: "attemptStatus",
      headerName: "Статус",
      minWidth: 200,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) =>
        data && (
          <Badge color={ATTEMPT_STATUS_COLORS[data.attemptStatus]}>
            {ATTEMPT_STATUS_LABELS[data.attemptStatus]}
          </Badge>
        ),
    },
    {
      field: "durationSeconds",
      headerName: "Длительность",
      minWidth: 130,
      valueFormatter: ({ value }) =>
        value === null ? "—" : formatDuration(value),
    },
    {
      field: "score",
      headerName: "Балл",
      minWidth: 120,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) => {
        if (!data) return null;
        const verdict = callVerdict(data);
        return verdict === null ? (
          <Text color="gray">—</Text>
        ) : (
          <Badge color={verdict === "passed" ? "green" : "red"}>
            {data.score} / {data.passThreshold}
          </Badge>
        );
      },
    },
    {
      ...ACTION_COLUMN,
      width: 130,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) => {
        if (!data) return null;
        const isOver = data.stage === "ended" || data.stage === "declined";
        return (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              disabled={!isOver}
              title={isOver ? undefined : "Звонок ещё идёт"}
              onClick={() =>
                navigate(ROUTES.debriefSession(data.trainingSessionId), {
                  state: { backTo: location.pathname, backLabel },
                })
              }
            >
              <FileSearch size={14} /> Разбор
            </Button>
          </Flex>
        );
      },
    },
  ];

  if (showOperator) {
    columnDefs.splice(1, 0, {
      field: "operatorName",
      headerName: "Ученик",
      flex: 1,
      minWidth: 170,
    });
  }

  return (
    <div className="min-h-80 flex-1">
      <DataTableReact<InstructorCall>
        {...DATA_TABLE_DEFAULTS}
        rowData={calls}
        columnDefs={columnDefs}
        getRowId={({ data }) => data.trainingSessionId}
      />
    </div>
  );
}
