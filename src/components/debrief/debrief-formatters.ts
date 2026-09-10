import type { TimelineEntry } from "../../contracts/debrief";

export const PANIC_LABELS = [
  "спокоен",
  "встревожен",
  "испуган",
  "паника",
  "истерика",
];

export const formatDuration = (seconds: number | null) =>
  seconds === null
    ? "—"
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export const formatOffset = (offsetMs: number | null) =>
  offsetMs === null ? "" : formatDuration(Math.floor(offsetMs / 1_000));

/** Как показать событие журнала: что писать в строке ленты. */
export const describeTimelineEntry = (
  entry: TimelineEntry,
): { title: string; text?: string } => {
  const details = entry.details as Record<string, string | number | undefined>;

  switch (entry.type) {
    case "operator.utterance":
      return { title: "Оператор", text: String(details.text ?? "") };
    case "caller.reply":
      return { title: "Заявитель", text: String(details.text ?? "") };
    case "caller.initiative":
      return { title: "Заявитель заговорил сам" };
    case "fact.revealed":
      return { title: "Получено сведение", text: String(details.label ?? "") };
    case "panic.changed":
      return {
        title: "Состояние заявителя",
        text: `${PANIC_LABELS[Number(details.from)] ?? details.from} → ${
          PANIC_LABELS[Number(details.to)] ?? details.to
        } (${details.trigger ?? ""})`,
      };
    case "escalation.fired":
      return {
        title: "Сработало правило",
        text: String(details.trigger ?? ""),
      };
    case "call.offered":
      return { title: "Входящий вызов" };
    case "call.accepted":
      return { title: "Вызов принят" };
    case "call.declined":
      return { title: "Вызов отклонён" };
    case "call.ended":
      return { title: "Вызов завершён", text: String(details.reason ?? "") };
    case "stage.changed":
      return { title: `Этап: ${String(details.to ?? "")}` };
    default:
      return { title: entry.type };
  }
};
