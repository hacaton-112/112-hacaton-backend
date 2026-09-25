import type { InstructorReportAttempt } from "../dto/instructor-report.dto";
import type { InstructorDdsCardInput } from "./dds-instructor-report-aggregation";
import type { DdsProcessErrorType } from "@/modules/dds-exercise/domain/dds-report-aggregation";

type GroupProcessErrorType =
  | DdsProcessErrorType
  | "voice_late_answer"
  | "voice_critical_question"
  | "voice_required_field"
  | "voice_incorrect_field";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  caller_name: "Заявитель",
  caller_phone: "Телефон заявителя",
  address: "Адрес",
  country: "Страна",
  federal_subject: "Субъект РФ",
  city: "Город",
  settlement: "Населённый пункт",
  district: "Район",
  street: "Улица",
  house: "Дом",
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  incident_type: "Тип происшествия",
  victims_total: "Всего пострадавших",
  victims_children: "Пострадавшие дети",
  deaths_total: "Всего погибших",
  deaths_children: "Погибшие дети",
  description: "Описание происшествия",
};

const average = (values: readonly number[]) =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const isoWeek = (dateText: string) => {
  const date = new Date(dateText);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

interface DynamicInput {
  key: string;
  label: string;
  occurredAt: string;
  score: number;
}

const dynamics = (items: readonly DynamicInput[]) => {
  const groups = new Map<
    string,
    { label: string; occurredAt: string; scores: number[] }
  >();
  for (const item of items) {
    const row = groups.get(item.key) ?? {
      label: item.label,
      occurredAt: item.occurredAt,
      scores: [],
    };
    row.scores.push(item.score);
    if (item.occurredAt < row.occurredAt) row.occurredAt = item.occurredAt;
    groups.set(item.key, row);
  }
  return [...groups.entries()]
    .sort((left, right) => left[1].occurredAt.localeCompare(right[1].occurredAt))
    .map(([key, row]) => ({
      key,
      label: row.label,
      occurredAt: row.occurredAt,
      averageScore: average(row.scores)!,
      attempts: row.scores.length,
    }));
};

export function summarizeGroupAnalytics(
  attempts: readonly InstructorReportAttempt[],
  ddsCards: readonly InstructorDdsCardInput[],
) {
  const orderedAttempts = [...attempts].sort((left, right) =>
    left.offeredAt.localeCompare(right.offeredAt),
  );
  const priorMisses = new Map<string, Set<string>>();
  const fieldStats = new Map<
    string,
    { correct: number; missed: number; correctedAfterHint: number }
  >();
  const studentFields = new Map<string, Map<string, { correct: number; total: number }>>();

  for (const attempt of orderedAttempts) {
    const missed = priorMisses.get(attempt.operatorId) ?? new Set<string>();
    const matrix = studentFields.get(attempt.operatorId) ?? new Map();
    for (const field of attempt.analysis.fields) {
      const stat = fieldStats.get(field.field) ?? {
        correct: 0,
        missed: 0,
        correctedAfterHint: 0,
      };
      const cell = matrix.get(field.field) ?? { correct: 0, total: 0 };
      if (field.matched) {
        stat.correct += 1;
        cell.correct += 1;
        // Разбор предыдущей попытки является подсказкой: отдельного события показа
        // подсказки в журнале нет, поэтому исправлением считаем успех после ошибки.
        if (missed.has(field.field)) stat.correctedAfterHint += 1;
      } else {
        stat.missed += 1;
        missed.add(field.field);
      }
      cell.total += 1;
      fieldStats.set(field.field, stat);
      matrix.set(field.field, cell);
    }
    priorMisses.set(attempt.operatorId, missed);
    studentFields.set(attempt.operatorId, matrix);
  }

  const fields = [...fieldStats]
    .map(([field, stat]) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      ...stat,
      total: stat.correct + stat.missed,
      correctRate: Math.round((stat.correct / (stat.correct + stat.missed)) * 100),
    }))
    .sort((left, right) => left.correctRate - right.correctRate || right.total - left.total);

  const referenceItems = new Map<
    string,
    { label: string; missing: number; present: number }
  >();
  const processErrors = new Map<GroupProcessErrorType, Map<string, number>>();
  const addProcessError = (
    type: GroupProcessErrorType,
    operatorId: string,
    count: number,
  ) => {
    if (count <= 0) return;
    const students = processErrors.get(type) ?? new Map<string, number>();
    students.set(operatorId, (students.get(operatorId) ?? 0) + count);
    processErrors.set(type, students);
  };
  for (const attempt of attempts) {
    addProcessError(
      "voice_late_answer",
      attempt.operatorId,
      attempt.answeredWithinNorm === false ? 1 : 0,
    );
    addProcessError(
      "voice_critical_question",
      attempt.operatorId,
      attempt.analysis.criticalQuestionsMissed ?? 0,
    );
    addProcessError(
      "voice_required_field",
      attempt.operatorId,
      attempt.analysis.requiredFieldsMissing ?? 0,
    );
    addProcessError(
      "voice_incorrect_field",
      attempt.operatorId,
      attempt.analysis.incorrectFields ?? 0,
    );
  }
  for (const card of ddsCards) {
    for (const item of card.coverage) {
      const row = referenceItems.get(item.id) ?? {
        label: item.label,
        missing: 0,
        present: 0,
      };
      row[item.status] += 1;
      referenceItems.set(item.id, row);
    }
    for (const type of card.processErrors) {
      addProcessError(type, card.operatorId, 1);
    }
  }
  const names = new Map([
    ...attempts.map(({ operatorId, operatorName }) => [operatorId, operatorName] as const),
    ...ddsCards.map(({ operatorId, operatorName }) => [operatorId, operatorName] as const),
  ]);
  const lessonIds = new Set(ddsCards.flatMap(({ lessonId }) => (lessonId ? [lessonId] : [])));

  return {
    cardFields: fields,
    ddsReferenceItems: [...referenceItems]
      .map(([id, row]) => ({
        id,
        ...row,
        total: row.missing + row.present,
        missRate: Math.round((row.missing / (row.missing + row.present)) * 100),
      }))
      .sort((left, right) => right.missRate - left.missRate || right.total - left.total),
    processErrors: [...processErrors]
      .map(([type, students]) => ({
        type,
        total: [...students.values()].reduce((sum, value) => sum + value, 0),
        students: [...students]
          .map(([operatorId, count]) => ({
            operatorId,
            operatorName: names.get(operatorId) ?? "Обучающийся",
            count,
          }))
          .sort((left, right) => right.count - left.count),
      }))
      .sort((left, right) => right.total - left.total),
    dynamics: {
      voice: dynamics(
        attempts.flatMap((attempt) =>
          attempt.score === null
            ? []
            : [{
                key: isoWeek(attempt.offeredAt),
                label: isoWeek(attempt.offeredAt),
                occurredAt: attempt.offeredAt,
                score: attempt.score,
              }],
        ),
      ),
      dds: dynamics(
        ddsCards.flatMap((card) => {
          if (card.finalScore === null) return [];
          const byLesson = lessonIds.size > 0 && lessonIds.size < 5 && card.lessonId;
          return [{
            key: byLesson ? card.lessonId! : isoWeek(card.occurredAt),
            label: byLesson ? (card.lessonTitle ?? "Занятие ДДС") : isoWeek(card.occurredAt),
            occurredAt: card.occurredAt,
            score: card.finalScore,
          }];
        }),
      ),
    },
    heatmap: {
      fields: fields.map(({ field, label }) => ({ field, label })),
      rows: [...studentFields].map(([operatorId, values]) => ({
        operatorId,
        operatorName: names.get(operatorId) ?? "Обучающийся",
        values: fields.map(({ field }) => {
          const cell = values.get(field);
          return cell ? Math.round((cell.correct / cell.total) * 100) : null;
        }),
      })),
    },
  };
}
