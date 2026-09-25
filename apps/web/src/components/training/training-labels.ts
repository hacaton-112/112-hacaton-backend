import type {
  CardSource,
  InstructorCall,
  LiveTrainingSession,
  TrainingAssignmentStatus,
  TrainingAttemptStatus,
  TrainingGroup,
} from "../../contracts/training";

export const ASSIGNMENT_STATUS_LABELS: Record<
  TrainingAssignmentStatus,
  string
> = {
  draft: "Черновик",
  in_progress: "Идёт занятие",
  completed: "Завершено",
  archived: "В архиве",
};

export const ASSIGNMENT_STATUS_COLORS = {
  draft: "amber",
  in_progress: "green",
  completed: "blue",
  archived: "gray",
} as const satisfies Record<TrainingAssignmentStatus, string>;

export const CARD_SOURCE_LABELS: Record<CardSource, string> = {
  generated: "Генерация по сценарию",
  ticket: "Билеты-задачи",
  operator_call: "Сформированные обучающимися",
  mixed: "Смешанные: генерация и сформированные",
};

export const ATTEMPT_STATUS_LABELS: Record<TrainingAttemptStatus, string> = {
  offered: "Вызов поступил",
  active: "Идёт звонок",
  completed: "Завершена",
  declined: "Вызов отклонён",
  cancelled_by_instructor: "Остановлена преподавателем",
  abandoned: "Прервана",
};

export const ATTEMPT_STATUS_COLORS = {
  offered: "amber",
  active: "green",
  completed: "blue",
  declined: "gray",
  cancelled_by_instructor: "red",
  abandoned: "orange",
} as const satisfies Record<TrainingAttemptStatus, string>;

export const LIVE_STAGE_LABELS: Record<LiveTrainingSession["stage"], string> = {
  offered: "Вызов поступил",
  conversation: "Разговор",
  wrap_up: "Заполнение карточки",
};

/** Прошёл ли звонок проходной порог назначения; `null` — оценки ещё нет. */
export const callVerdict = (
  call: Pick<InstructorCall, "score" | "passThreshold">,
): "passed" | "failed" | null =>
  call.score === null
    ? null
    : call.score >= call.passThreshold
      ? "passed"
      : "failed";

export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatScore = (score: number | null) =>
  score === null ? "—" : `${score} из 100`;

/** Строка таблицы групп: ученик вместе с данными своей группы. */
export interface GroupTableRow {
  rowId: string;
  groupId: string;
  groupName: string;
  groupCode: string;
  organization: string;
  groupStatus: TrainingGroup["status"];
  membersCount: number;
  /** `null` — у группы ещё нет учеников, строка держит место группы. */
  student: TrainingGroup["members"][number] | null;
}

/**
 * Таблица группирует строки учеников по группе. Группа без учеников иначе
 * пропала бы из таблицы целиком, поэтому за неё встаёт пустая строка.
 */
export const toGroupTableRows = (groups: TrainingGroup[]): GroupTableRow[] =>
  groups.flatMap((group): GroupTableRow[] => {
    const base = {
      groupId: group.id,
      groupName: group.name,
      groupCode: group.code,
      organization: group.organization,
      groupStatus: group.status,
      membersCount: group.members.length,
    };
    return group.members.length === 0
      ? [{ ...base, rowId: group.id, student: null }]
      : group.members.map((student) => ({
          ...base,
          rowId: `${group.id}:${student.userId}`,
          student,
        }));
  });
