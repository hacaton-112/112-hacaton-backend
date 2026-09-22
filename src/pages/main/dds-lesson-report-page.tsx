import { DataTableReact } from "@bolid-ui/data-table";
import type { ColDef, RowClickedEvent } from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Skeleton,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";

import { DdsReportCardDetails } from "../../components/dds/dds-report-card-details";
import type {
  DdsLessonReport,
  DdsReportFormat,
} from "../../contracts/dds-report";
import { useDdsLessonReport } from "../../hooks/use-dds-report";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { ddsReportService } from "../../services/dds-report.service";

type Student = DdsLessonReport["students"][number];

const columns: ColDef<Student>[] = [
  { field: "operatorName", headerName: "Обучающийся", minWidth: 190, flex: 2 },
  { field: "cards", headerName: "Карточек", minWidth: 100 },
  {
    field: "averageScore",
    headerName: "Средний балл",
    minWidth: 130,
    valueFormatter: ({ value }) => value ?? "—",
  },
  {
    field: "minScore",
    headerName: "Минимум",
    minWidth: 100,
    valueFormatter: ({ value }) => value ?? "—",
  },
  {
    field: "maxScore",
    headerName: "Максимум",
    minWidth: 100,
    valueFormatter: ({ value }) => value ?? "—",
  },
];

export default function DdsLessonReportPage() {
  const { lessonId } = useParams();
  const { report, retryInsights } = useDdsLessonReport(lessonId);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>();
  const [downloading, setDownloading] = useState<DdsReportFormat>();
  const data = report.data;
  const operatorId = selectedOperatorId ?? data?.students[0]?.operatorId;
  const cards = useMemo(
    () => data?.cards.filter((card) => card.operatorId === operatorId) ?? [],
    [data, operatorId],
  );
  const selectedCard =
    cards.find((card) => card.exerciseId === selectedExerciseId) ?? cards[0];

  const download = async (format: DdsReportFormat) => {
    if (!lessonId) return;
    setDownloading(format);
    try {
      const filename = await ddsReportService.download(lessonId, format);
      toast.success("Отчёт сохранён", { description: filename });
    } catch (error) {
      toast.error("Не удалось выгрузить отчёт", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(undefined);
    }
  };

  if (report.isPending)
    return (
      <main className="grid gap-4 p-6">
        <Skeleton height="56px" />
        <Skeleton height="420px" />
      </main>
    );
  if (report.error || !data)
    return (
      <main className="p-6">
        <Callout.Root color="red">
          <Callout.Icon>
            <AlertTriangle />
          </Callout.Icon>
          <Callout.Text>
            {report.error?.message ?? "Отчёт не найден"}
          </Callout.Text>
        </Callout.Root>
      </main>
    );

  return (
    <main className="grid gap-4 overflow-auto p-4 md:p-6">
      <Flex justify="between" align="start" gap="3" wrap="wrap">
        <div>
          <Heading size="6">{data.lesson.title}</Heading>
          <Text color="gray">Итоги занятия ДДС</Text>
        </div>
        <Flex gap="2" wrap="wrap">
          {(["pdf", "xlsx", "csv"] as const).map((format) => (
            <Button
              key={format}
              variant="soft"
              disabled={Boolean(downloading)}
              onClick={() => void download(format)}
            >
              <Download size={15} />
              {format.toUpperCase()}
            </Button>
          ))}
        </Flex>
      </Flex>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Карточек", data.summary.cards],
          ["Средний балл", data.summary.averageScore ?? "—"],
          ["Минимум", data.summary.minScore ?? "—"],
          ["Максимум", data.summary.maxScore ?? "—"],
          [
            "В нормативе",
            data.summary.withinNormPercent === null
              ? "—"
              : `${data.summary.withinNormPercent}%`,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)} size="2">
            <Text size="1" color="gray">
              {label}
            </Text>
            <Heading size="5">{value}</Heading>
          </Card>
        ))}
      </div>

      <Card size="2" className="grid gap-3">
        <Flex align="center" gap="2">
          <Heading size="4">Выводы по группе</Heading>
          {data.insights?.status === "done" && <Badge color="violet">ИИ</Badge>}
        </Flex>
        {!data.insights ? (
          <Flex align="center" gap="3">
            <Text color="gray">
              Выводы для этого занятия ещё не запускались.
            </Text>
            <Button
              variant="soft"
              disabled={retryInsights.isPending}
              onClick={() => retryInsights.mutate()}
            >
              <RefreshCw size={15} />
              Сформировать
            </Button>
          </Flex>
        ) : data.insights.status === "pending" ||
          data.insights.status === "processing" ? (
          <Text color="gray">Выводы формируются…</Text>
        ) : data.insights.status === "failed" ? (
          <Flex align="center" gap="3">
            <Text color="red">Выводы сформировать не удалось.</Text>
            <Button
              variant="soft"
              disabled={retryInsights.isPending}
              onClick={() => retryInsights.mutate()}
            >
              <RefreshCw size={15} />
              Повторить
            </Button>
          </Flex>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <InsightList
              title="Сильные стороны"
              items={data.insights.strengths}
            />
            <InsightList title="Зоны роста" items={data.insights.weaknesses} />
            <InsightList
              title="Рекомендации"
              items={data.insights.recommendations}
            />
            {data.insights.focusScenarios.length > 0 && (
              <Flex
                align="center"
                gap="2"
                wrap="wrap"
                className="md:col-span-3"
              >
                <Text size="2" color="gray">
                  Повторить сценарии:
                </Text>
                {data.insights.focusScenarios.map((code) => (
                  <Badge key={code}>{code}</Badge>
                ))}
              </Flex>
            )}
          </div>
        )}
      </Card>

      <Card size="2" className="grid gap-3">
        <Heading size="4">Обучающиеся</Heading>
        <div className="h-72">
          <DataTableReact<Student>
            {...DATA_TABLE_DEFAULTS}
            rowData={data.students}
            columnDefs={columns}
            getRowId={({ data: row }) => row.operatorId}
            rowSelection={{ mode: "singleRow", enableClickSelection: true }}
            onRowClicked={(event: RowClickedEvent<Student>) => {
              setSelectedOperatorId(event.data?.operatorId);
              setSelectedExerciseId(undefined);
            }}
          />
        </div>
      </Card>

      {operatorId && (
        <Card size="2" className="grid gap-3">
          <Heading size="4">Карточки обучающегося</Heading>
          <Flex gap="2" wrap="wrap">
            {cards.map((card) => (
              <Button
                key={card.exerciseId}
                size="1"
                variant={
                  card.exerciseId === selectedCard?.exerciseId
                    ? "solid"
                    : "soft"
                }
                onClick={() => setSelectedExerciseId(card.exerciseId)}
              >
                {card.scenarioTitle} · {card.finalScore ?? "—"}
              </Button>
            ))}
          </Flex>
          {selectedCard && <DdsReportCardDetails card={selectedCard} />}
        </Card>
      )}
    </main>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <Text weight="bold">{title}</Text>
      {items.map((item, index) => (
        <Text key={`${item}-${index}`} as="p" size="2">
          • {item}
        </Text>
      ))}
    </div>
  );
}
