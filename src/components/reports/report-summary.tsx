import { Card, Text } from "@bolid-ui/themes";

import type { InstructorReport } from "../../contracts/reports";
import {
  formatDateTime,
  formatDuration,
  formatScore,
} from "../training/training-labels";

export function ReportSummary({ report }: { report: InstructorReport }) {
  const { stats } = report;
  const tiles = [
    { label: "Попыток", value: String(stats.attempts) },
    { label: "Завершено", value: String(stats.completedAttempts) },
    { label: "Оценено", value: String(stats.evaluatedAttempts) },
    { label: "Сдано", value: String(stats.passedAttempts) },
    {
      label: "Процент сдачи",
      value: stats.passRate === null ? "—" : `${stats.passRate}%`,
    },
    { label: "Средний балл", value: formatScore(stats.averageScore) },
    { label: "Лучший балл", value: formatScore(stats.bestScore) },
    {
      label: "Ответ, сред.",
      value:
        stats.averageAnswerSeconds === null
          ? "—"
          : formatDuration(stats.averageAnswerSeconds),
    },
    {
      label: "Звонок, сред.",
      value:
        stats.averageDurationSeconds === null
          ? "—"
          : formatDuration(stats.averageDurationSeconds),
    },
    {
      label: "Последняя попытка",
      value: stats.lastAttemptAt ? formatDateTime(stats.lastAttemptAt) : "—",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label} size="2">
          <Text as="p" size="1" color="gray">
            {tile.label}
          </Text>
          <Text as="p" size="4" weight="bold">
            {tile.value}
          </Text>
        </Card>
      ))}
    </div>
  );
}
