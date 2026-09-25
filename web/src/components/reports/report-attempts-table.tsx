import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import { Badge, Button, Flex, Text } from "@bolid-ui/themes";
import { FileSearch } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type { InstructorReportAttempt } from "../../contracts/reports";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import {
  ATTEMPT_STATUS_COLORS,
  ATTEMPT_STATUS_LABELS,
  formatDateTime,
  formatDuration,
} from "../training/training-labels";

const errorCount = (attempt: InstructorReportAttempt): number | null => {
  const values = [
    attempt.analysis.criticalQuestionsMissed,
    attempt.analysis.requiredFieldsMissing,
    attempt.analysis.incorrectFields,
  ];
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
};

export function ReportAttemptsTable({
  attempts,
}: {
  attempts: InstructorReportAttempt[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const columns: ColDef<InstructorReportAttempt>[] = [
    {
      field: "offeredAt",
      headerName: "Дата",
      minWidth: 160,
      sort: "desc",
      valueFormatter: ({ value }) => formatDateTime(value),
    },
    {
      field: "operatorName",
      headerName: "Ученик",
      minWidth: 170,
      flex: 1,
    },
    {
      colId: "scenario",
      headerName: "Сценарий",
      minWidth: 200,
      flex: 2,
      valueGetter: ({ data }) =>
        data ? `${data.scenarioCode} · ${data.scenarioTitle}` : "",
    },
    {
      field: "status",
      headerName: "Статус",
      minWidth: 180,
      cellRenderer: ({ data }: ICellRendererParams<InstructorReportAttempt>) =>
        data && (
          <Badge color={ATTEMPT_STATUS_COLORS[data.status]}>
            {ATTEMPT_STATUS_LABELS[data.status]}
          </Badge>
        ),
    },
    {
      colId: "answer",
      headerName: "Ответ / норматив",
      minWidth: 150,
      cellRenderer: ({ data }: ICellRendererParams<InstructorReportAttempt>) =>
        data && (
          <Text color={data.answeredWithinNorm === false ? "red" : undefined}>
            {data.answerSeconds === null ? "—" : `${data.answerSeconds} с`} /{" "}
            {data.answerNormSeconds} с
          </Text>
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
      minWidth: 110,
      cellRenderer: ({ data }: ICellRendererParams<InstructorReportAttempt>) =>
        data &&
        (data.score === null ? (
          <Text color="gray">—</Text>
        ) : (
          <Badge color={data.passed ? "green" : "red"}>
            {data.score} / {data.passThreshold}
          </Badge>
        )),
    },
    {
      colId: "errors",
      headerName: "Ошибки",
      minWidth: 100,
      valueGetter: ({ data }) => (data ? errorCount(data) : null),
      valueFormatter: ({ value }) => (value === null ? "—" : String(value)),
      headerTooltip:
        "Пропущенные критические вопросы, обязательные и некорректные поля",
    },
    {
      ...ACTION_COLUMN,
      width: 120,
      cellRenderer: ({ data }: ICellRendererParams<InstructorReportAttempt>) =>
        data && (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              disabled={data.analysis.status !== "ready"}
              onClick={() =>
                navigate(ROUTES.debriefSession(data.trainingSessionId), {
                  state: { backTo: location.pathname, backLabel: "К отчёту" },
                })
              }
            >
              <FileSearch size={14} /> Разбор
            </Button>
          </Flex>
        ),
    },
  ];

  return (
    <div className="min-h-80">
      <DataTableReact<InstructorReportAttempt>
        {...DATA_TABLE_DEFAULTS}
        rowData={attempts}
        columnDefs={columns}
        getRowId={({ data }) => data.trainingSessionId}
      />
    </div>
  );
}
