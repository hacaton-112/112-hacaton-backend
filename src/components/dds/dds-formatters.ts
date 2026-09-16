import type {
  DdsExerciseViolation,
  DdsResponseStatus,
  DdsServiceCode,
} from "../../contracts/dds-exercise";

export const DDS_STATUS_LABELS: Record<DdsResponseStatus, string> = {
  pending: "Ожидает подтверждения",
  accepted: "Принята",
  not_accepted: "Не принята",
  responding: "Начало реагирования",
  arrived: "Прибытие",
  working: "Проведение работ",
  completed: "Работы завершены",
  refused: "Отказ от выполнения работ",
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
