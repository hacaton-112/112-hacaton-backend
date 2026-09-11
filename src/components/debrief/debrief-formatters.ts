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

export interface TranscriptLine {
  readonly sequence: number;
  readonly offsetMs: number | null;
  readonly speaker: "operator" | "caller";
  readonly text: string;
  /** Чем эта реплика отличается от обычной: пометка рядом с именем. */
  readonly note?: string;
}

const replyNote = (
  details: Record<string, unknown>,
  afterSilence: boolean,
): string | undefined => {
  if (details.prescribed === true) {
    return "первая реплика сценария";
  }

  const generation = details.generation as { source?: string } | undefined;

  if (generation?.source === "fallback") {
    // Запасную реплику писал не LLM, а движок: судить по ней о качестве
    // диалога нельзя, и на разборе это должно быть видно.
    return afterSilence
      ? "заговорил сам · запасная реплика"
      : "запасная реплика";
  }

  return afterSilence ? "заговорил сам" : undefined;
};

/**
 * Разговор без служебных событий.
 *
 * Разбор начинается с того, что было сказано, а факты, ступени паники и
 * сработавшие правила читаются потом — в общей ленте они перебивают реплики.
 */
export const conversationOf = (
  timeline: readonly TimelineEntry[],
): readonly TranscriptLine[] => {
  const lines: TranscriptLine[] = [];
  let afterSilence = false;

  for (const entry of timeline) {
    const details = entry.details as Record<string, unknown>;

    if (entry.type === "caller.initiative") {
      // Реплики оператора не было: заявитель не выдержал паузы.
      afterSilence = true;
      continue;
    }

    if (entry.type !== "operator.utterance" && entry.type !== "caller.reply") {
      continue;
    }

    const text = typeof details.text === "string" ? details.text.trim() : "";

    if (text.length === 0) {
      continue;
    }

    const caller = entry.type === "caller.reply";

    lines.push({
      sequence: entry.sequence,
      offsetMs: entry.offsetMs,
      speaker: caller ? "caller" : "operator",
      text,
      note: caller ? replyNote(details, afterSilence) : undefined,
    });

    if (caller) {
      afterSilence = false;
    }
  }

  return lines;
};
