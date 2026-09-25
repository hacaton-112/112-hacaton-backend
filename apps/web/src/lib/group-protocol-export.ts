import type { GroupStudent, TrainingAssignment, TrainingGroup } from "../contracts/training";
import { formatDateTime, formatDuration } from "../components/training/training-labels";

export interface GroupProtocolData {
  group: TrainingGroup;
  students: GroupStudent[];
  assignments: TrainingAssignment[];
  instructorName?: string;
}

/**
 * Формирует CSV-файл протокола группы для открытия в Excel (с UTF-8 BOM и разделителем ;)
 */
export function generateGroupProtocolCsv(data: GroupProtocolData): string {
  const { group, students, assignments, instructorName } = data;
  const now = new Date();
  const dateStr = formatDateTime(now.toISOString());

  const lines: string[] = [];

  // UTF-8 BOM для корректного открытия в Excel на Windows
  const BOM = "\uFEFF";

  // Шапка протокола
  lines.push("ПРОТОКОЛ УЧЕБНЫХ ЗАНЯТИЙ И УСПЕВАЕМОСТИ ГРУППЫ");
  lines.push(`Группа;${escapeCsv(group.name)}`);
  lines.push(`Шифр группы;${escapeCsv(group.code)}`);
  lines.push(`Организация;${escapeCsv(group.organization)}`);
  if (instructorName) {
    lines.push(`Преподаватель;${escapeCsv(instructorName)}`);
  }
  lines.push(`Дата формирования;${escapeCsv(dateStr)}`);
  lines.push(`Статус группы;${group.status === "active" ? "Активна" : "В архиве"}`);
  lines.push("");

  // Сводные показатели
  const totalAttempts = students.reduce((sum, s) => sum + s.stats.attempts, 0);
  const totalEvaluated = students.reduce((sum, s) => sum + s.stats.evaluatedCalls, 0);
  const totalPassed = students.reduce((sum, s) => sum + s.stats.passedCalls, 0);
  const scores = students.map((s) => s.stats.averageScore).filter((s): s is number => s !== null);
  const groupAvgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const passRate = totalEvaluated > 0 ? Math.round((totalPassed / totalEvaluated) * 100) : 0;

  lines.push("СВОДНЫЕ ПОКАЗАТЕЛИ ГРУППЫ");
  lines.push(`Всего обучающихся;${students.length}`);
  lines.push(`Всего назначенных занятий;${assignments.length}`);
  lines.push(`Всего тренировочных звонков;${totalAttempts}`);
  lines.push(`Оценено звонков;${totalEvaluated}`);
  lines.push(`Сдано выше порога;${totalPassed} (${passRate}%)`);
  lines.push(`Средний балл по группе;${groupAvgScore !== null ? `${groupAvgScore} из 100` : "—"}`);
  lines.push("");

  // Список занятий группы
  if (assignments.length > 0) {
    lines.push("НАЗНАЧЕННЫЕ ЗАНЯТИЯ");
    lines.push("Название занятия;Сценарий;Категория;Сложность;Норматив (сек);Порог сдачи;Попыток лимит;Статус");
    for (const a of assignments) {
      lines.push([
        escapeCsv(a.title),
        escapeCsv(`${a.scenarioCode} · ${a.scenarioTitle}`),
        escapeCsv(a.category),
        a.difficulty,
        a.answerNormSeconds,
        `${a.passThreshold} б.`,
        a.maxAttempts ?? "Без лимита",
        a.status === "in_progress" ? "Запущено" : a.status === "completed" ? "Завершено" : a.status === "draft" ? "Черновик" : "Архив",
      ].join(";"));
    }
    lines.push("");
  }

  // Ведомость обучающихся
  lines.push("ВЕДОМОСТЬ ОБУЧАЮЩИХСЯ");
  lines.push("№;ФИО обучающегося;Email;Служба;Всего попыток;Завершено;Оценено;Сдано выше порога;Средний балл;Лучший балл;Среднее время ответа;Последний звонок");

  students.forEach((student, index) => {
    lines.push([
      index + 1,
      escapeCsv(student.fullName),
      escapeCsv(student.email),
      escapeCsv(student.serviceTag),
      student.stats.attempts,
      student.stats.completedAttempts,
      student.stats.evaluatedCalls,
      student.stats.passedCalls,
      student.stats.averageScore !== null ? student.stats.averageScore : "—",
      student.stats.bestScore !== null ? student.stats.bestScore : "—",
      student.stats.averageAnswerSeconds !== null ? formatDuration(student.stats.averageAnswerSeconds) : "—",
      student.stats.lastAttemptAt ? formatDateTime(student.stats.lastAttemptAt) : "—",
    ].join(";"));
  });

  return BOM + lines.join("\r\n");
}

function escapeCsv(value: string | number): string {
  const str = String(value);
  if (str.includes(";") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Скачивает сгенерированный CSV файл в браузере / клиенте
 */
export function downloadFile(content: string, filename: string, mimeType = "text/csv;charset=utf-8;"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
