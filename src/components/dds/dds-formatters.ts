import type {
  DdsCrewCall,
  DdsExerciseViolation,
  DdsResponseStatus,
  DdsServiceCode,
} from "../../contracts/dds-exercise";

export const DDS_STATUS_LABELS: Record<DdsResponseStatus, string> = {
  pending: "Добавлена",
  accepted: "Принята",
  not_accepted: "Не принята",
  responding: "Начало реагирования",
  arrived: "Прибытие",
  working: "Проведение работ",
  completed: "Работы завершены",
  refused: "Отказ от выполнения работ",
  lesson_finished: "Занятие завершено преподавателем",
};

/** Классы происшествий на языке карточки, а не кодами схемы. */
export const DDS_CATEGORY_LABELS: Record<string, string> = {
  fire: "пожар",
  road_accident: "ДТП",
  medical: "медицина",
  criminal: "криминал",
  gas_leak: "утечка газа",
  other: "прочее",
};

export const DDS_SERVICE_LABELS: Record<DdsServiceCode, string> = {
  dds_01: "Пожарная охрана",
  dds_02: "Полиция",
  dds_03: "Скорая помощь",
  dds_04: "Аварийная газовая служба",
  zhkh: "ЖКХ",
  antiterror: "Антитеррористическая комиссия",
  eddc: "ЕДДЦ",
  uadit: "УАДиТ",
  rosgvardia: "Росгвардия",
  cuks: "ЦУКС",
  ass: "АСС",
  lpc: "ЛПЦ",
  ss: "СС",
};

export const DDS_VIOLATION_LABELS: Record<DdsExerciseViolation, string> = {
  acknowledgement_deadline_missed:
    "Первичный статус установлен позже 30 секунд",
  response_refused: "Зафиксирован отказ от выполнения работ",
  crew_handoff_late: "Карточка передана наряду позже минуты после принятия",
  wrong_crew_dialed: "До нужного наряда набран неверный номер",
  crew_handoff_missing: "Работы завершены без передачи карточки наряду",
};

export const requiresComment = (status: DdsResponseStatus): boolean =>
  status === "not_accepted" || status === "refused";

export function acknowledgementSecondsLeft(
  deadlineAt: string,
  nowMs: number,
): number {
  return Math.max(0, Math.ceil((Date.parse(deadlineAt) - nowMs) / 1_000));
}

export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export type CrewCallVerdictColor = "green" | "amber" | "red" | "gray" | "blue";

/**
 * Итог звонка наряду для журнала на карточке.
 *
 * «Принял» — только звонок в службу, которой адресована карточка: разговор с
 * чужим нарядом тоже доходит до конца, но карточку не передаёт.
 */
export function crewCallVerdict(call: DdsCrewCall): {
  label: string;
  color: CrewCallVerdictColor;
} {
  if (call.outcome === null) {
    return call.endedAt === null
      ? { label: "Идёт разговор", color: "blue" }
      : { label: "Разговор оборвался", color: "gray" };
  }

  switch (call.outcome) {
    case "unknown_number":
      return { label: "Номер не обслуживается", color: "red" };
    case "abandoned":
      return { label: "Разговор прерван", color: "gray" };
    case "completed":
      if (call.correct === true)
        return { label: "Наряд принял", color: "green" };
      if (call.correct === false)
        return { label: "Не та служба", color: "amber" };
      return { label: "Без принятой карточки", color: "gray" };
  }
}
