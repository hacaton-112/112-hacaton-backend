import { DataTableReact } from "@bolid-ui/data-table";
import type { ColDef } from "@bolid-ui/data-table/community";
import { Card, Flex, Grid, Heading, Text } from "@bolid-ui/themes";
import { useMemo } from "react";

import type { InstructorReport } from "../../contracts/reports";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";

type Analytics = NonNullable<InstructorReport["analytics"]>;
type HeatmapRow = Analytics["heatmap"]["rows"][number];

const PROCESS_ERROR_LABELS: Record<string, string> = {
  late_acknowledgement: "Карточка принята позже норматива",
  unexpected_refusal: "Необоснованный отказ",
  missed_refusal: "Пропущен ожидаемый отказ",
  unfinished: "Карточка не завершена",
  voice_late_answer: "Ответ позже норматива",
  voice_critical_question: "Пропущен критический вопрос",
  voice_required_field: "Не заполнено обязательное поле",
  voice_incorrect_field: "Поле карточки заполнено неверно",
};

function ScoreChart({ analytics }: { analytics: Analytics }) {
  const series = [
    { name: "Голос", color: "#2563eb", values: analytics.dynamics.voice },
    { name: "ДДС", color: "#dc2626", values: analytics.dynamics.dds },
  ];
  const points = series.flatMap(({ values }) => values);
  if (points.length === 0) return <Text size="2" color="gray">Нет оценок для динамики.</Text>;
  const count = Math.max(...series.map(({ values }) => values.length), 2);
  const path = (values: typeof analytics.dynamics.voice) =>
    values.map((item, index) =>
      `${index === 0 ? "M" : "L"} ${32 + (index * 536) / (count - 1)} ${212 - item.averageScore * 1.72}`,
    ).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 600 240" role="img" aria-label="Динамика среднего балла" className="min-w-150">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1="32" x2="568" y1={212 - tick * 1.72} y2={212 - tick * 1.72} stroke="currentColor" opacity="0.12" />
            <text x="2" y={216 - tick * 1.72} fontSize="10" fill="currentColor">{tick}</text>
          </g>
        ))}
        {series.map(({ name, color, values }) => values.length > 0 && (
          <g key={name}>
            <path d={path(values)} fill="none" stroke={color} strokeWidth="3" />
            {values.map((item, index) => (
              <circle key={item.key} cx={32 + (index * 536) / (count - 1)} cy={212 - item.averageScore * 1.72} r="4" fill={color}>
                <title>{name}: {item.label}, {item.averageScore}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <Flex gap="4" justify="center">
        {series.map(({ name, color }) => <Text key={name} size="1" style={{ color }}>● {name}</Text>)}
      </Flex>
    </div>
  );
}

export function ReportAnalytics({ analytics }: { analytics: Analytics }) {
  const columns = useMemo<ColDef<HeatmapRow>[]>(() => [
    { field: "operatorName", headerName: "Обучающийся", minWidth: 190, pinned: "left" },
    ...analytics.heatmap.fields.map((field, index) => ({
      colId: field.field,
      headerName: field.label,
      minWidth: 145,
      valueGetter: ({ data }: { data: HeatmapRow | undefined }) => data?.values[index] ?? null,
      valueFormatter: ({ value }: { value: number | null }) => value === null ? "—" : `${value}%`,
      cellStyle: ({ value }: { value: number | null }) => value === null ? undefined : {
        backgroundColor: value >= 80 ? "#dcfce7" : value >= 60 ? "#fef3c7" : "#fee2e2",
        color: "#111827",
      },
    })),
  ], [analytics.heatmap.fields]);

  return (
    <Card size="2" variant="surface" className="grid gap-5">
      <Heading size="4">Аналитика группы</Heading>
      <Grid columns={{ initial: "1", lg: "2" }} gap="5">
        <div>
          <Heading size="3" mb="2">Слабые поля карточки</Heading>
          {analytics.cardFields.length === 0 ? <Text color="gray">Нет данных.</Text> : (
            <ul className="grid gap-1 text-sm">
              {analytics.cardFields.slice(0, 8).map((field) => (
                <li key={field.field}>{field.label}: {field.correctRate}% верно · исправлено после разбора {field.correctedAfterHint}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <Heading size="3" mb="2">Пропуски в карточках ДДС</Heading>
          {analytics.ddsReferenceItems.length === 0 ? <Text color="gray">Нет оценённых текстов.</Text> : (
            <ul className="grid gap-1 text-sm">
              {analytics.ddsReferenceItems.slice(0, 8).map((item) => (
                <li key={item.id}>{item.label} ({item.id}): {item.missRate}% пропусков</li>
              ))}
            </ul>
          )}
        </div>
      </Grid>
      <div>
        <Heading size="3" mb="2">Ошибки процесса</Heading>
        {analytics.processErrors.length === 0 ? <Text color="gray">Ошибок не выявлено.</Text> : (
          <ul className="grid gap-1 text-sm">
            {analytics.processErrors.map((error) => (
              <li key={error.type}>
                {PROCESS_ERROR_LABELS[error.type] ?? error.type}: {error.total} · {error.students.map((student) => `${student.operatorName} — ${student.count}`).join("; ")}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <Heading size="3" mb="2">Динамика среднего балла</Heading>
        <ScoreChart analytics={analytics} />
      </div>
      <div>
        <Heading size="3" mb="2">Тепловая карта полей</Heading>
        <div className="h-72 min-w-0">
          <DataTableReact<HeatmapRow>
            {...DATA_TABLE_DEFAULTS}
            rowData={analytics.heatmap.rows}
            columnDefs={columns}
            getRowId={({ data }) => data.operatorId}
          />
        </div>
      </div>
    </Card>
  );
}
