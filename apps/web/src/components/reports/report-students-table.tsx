import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import { Button, Flex } from "@bolid-ui/themes";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type { InstructorReportStudent } from "../../contracts/reports";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { formatScore } from "../training/training-labels";

export function ReportStudentsTable({
  students,
}: {
  students: InstructorReportStudent[];
}) {
  const navigate = useNavigate();
  const columns: ColDef<InstructorReportStudent>[] = [
    {
      field: "operatorName",
      headerName: "Ученик",
      minWidth: 190,
      flex: 2,
    },
    { field: "email", headerName: "Email", minWidth: 210, flex: 2 },
    {
      colId: "services",
      headerName: "Службы",
      minWidth: 140,
      valueGetter: ({ data }) => data?.serviceTags.join(", ") || "—",
    },
    {
      colId: "attempts",
      headerName: "Попыток",
      minWidth: 100,
      valueGetter: ({ data }) => data?.stats.attempts,
    },
    {
      colId: "averageScore",
      headerName: "Средний балл",
      minWidth: 130,
      valueGetter: ({ data }) => data?.stats.averageScore ?? null,
      valueFormatter: ({ value }) => formatScore(value),
    },
    {
      colId: "passRate",
      headerName: "Сдача",
      minWidth: 110,
      valueGetter: ({ data }) => data?.stats.passRate ?? null,
      valueFormatter: ({ value }) => (value === null ? "—" : `${value}%`),
    },
    {
      ...ACTION_COLUMN,
      width: 120,
      cellRenderer: ({ data }: ICellRendererParams<InstructorReportStudent>) =>
        data && (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              onClick={() => navigate(ROUTES.student(data.operatorId))}
            >
              Открыть <ArrowRight size={14} />
            </Button>
          </Flex>
        ),
    },
  ];

  return (
    <div className="min-h-72">
      <DataTableReact<InstructorReportStudent>
        {...DATA_TABLE_DEFAULTS}
        rowData={students}
        columnDefs={columns}
        getRowId={({ data }) => data.operatorId}
      />
    </div>
  );
}
