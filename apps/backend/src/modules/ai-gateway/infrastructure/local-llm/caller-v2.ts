import {
  CallerReplySchema,
  type CallerEmotion,
  type DialogueTurn,
  type GenerateCallerReplyRequest,
  type LlmStreamEvent,
} from "@/contracts";
import { expandRussianAddressAbbreviations } from "@/common/utils/russian-text";

export const CALLER_V2_SYSTEM_PROMPT =
  "Ты заявитель: сам звонишь в 112 за помощью. Ты не оператор и не диспетчер. Отвечай только на последнюю реплику оператора и только тем, что знаешь.";

export const CALLER_V2_PANIC_DESCRIPTIONS = [
  "владеет собой, отвечает по существу и сам структурирует рассказ",
  "встревожен, отвечает на вопрос, но добавляет лишнее",
  "взвинчен, говорит короткими фразами, перескакивает между темами",
  "в панике, отвечает одним-двумя предложениями и сбивается на отдельных словах",
  "не владеет собой, говорит резко и воспринимает только короткие простые команды",
] as const;

/**
 * Окно растёт до пяти обменов, затем отбрасывает сразу два старых обмена.
 * Так начало стабильного префикса меняется раз в три хода, а не на каждом.
 */
export const callerV2HistoryWindow = (
  turns: readonly DialogueTurn[],
  callerTurns: number,
): readonly DialogueTurn[] => {
  const wanted =
    callerTurns <= 5 ? callerTurns * 2 : 6 + 2 * ((callerTurns - 6) % 3);
  return turns.slice(-Math.min(10, wanted));
};

export const buildCallerV2Prompt = (
  request: GenerateCallerReplyRequest,
): string => {
  const panicLevel = request.panicLevel ?? 0;
  const callerTurns =
    request.callerTurns ?? Math.floor(request.context.recentTurns.length / 2);
  const history = callerV2HistoryWindow(
    request.context.recentTurns,
    callerTurns,
  )
    .map(
      ({ role, text }) => `${role === "operator" ? "Оператор" : "Ты"}: ${text}`,
    )
    .join("\n");
  const ordinaryFacts = request.context.allowedFacts.filter(
    ({ id }) => id !== "caller_name",
  );
  const callerName = request.context.allowedFacts.find(
    ({ id }) => id === "caller_name",
  );
  const facts = [
    ...ordinaryFacts.map(({ value }) =>
      expandRussianAddressAbbreviations(value),
    ),
    ...(callerName
      ? [
          `Меня зовут ${expandRussianAddressAbbreviations(callerName.value)
            .replace(/^меня зовут\s+/iu, "")
            .replace(/[.!?]+$/u, "")}.`,
        ]
      : []),
  ];

  return [
    `Ты: ${request.context.persona.description}`,
    `Знаешь:\n${facts.map((fact) => `- ${fact}`).join("\n")}`,
    `Разговор:\n${history || "(начало)"}`,
    `Сейчас: ${CALLER_V2_PANIC_DESCRIPTIONS[panicLevel]}`,
    `Оператор: ${request.operatorText}`,
  ].join("\n");
};

export const CALLER_V2_RESPONSE_PATTERN =
  /^\s*([+-]?[01])\s+(calm|anxious|panic|anger|confusion|pain|neutral)\s*\n+\s*(.+?)\s*$/su;

export interface CallerV2ParsedReply {
  readonly panicShift: -1 | 0 | 1;
  readonly emotion: CallerEmotion;
  readonly text: string;
  readonly validHeader: boolean;
}

export const parseCallerV2Reply = (raw: string): CallerV2ParsedReply => {
  const match = CALLER_V2_RESPONSE_PATTERN.exec(raw);
  if (!match) {
    return {
      panicShift: 0,
      emotion: "neutral",
      text: raw.trim(),
      validHeader: false,
    };
  }

  return {
    panicShift: Number(match[1]) as -1 | 0 | 1,
    emotion: match[2] as CallerEmotion,
    text: match[3]!.trim(),
    validHeader: true,
  };
};

/** Прячет служебный заголовок и переводит ответ студента в общий JSON-контракт. */
export async function* expandCallerV2Reply(
  stream: AsyncIterable<LlmStreamEvent>,
  request: GenerateCallerReplyRequest,
  warn: (message: string) => void,
): AsyncIterable<LlmStreamEvent> {
  let raw = "";
  let headerParsed = false;
  let validHeader = false;
  let panicShift: -1 | 0 | 1 = 0;
  let emotion: CallerEmotion = "neutral";
  let pendingReply = "";
  const fallback = request.fallbackReply;
  for await (const event of stream) {
    if (event.type !== "response.completed") {
      raw += event.delta;
      if (raw.length > 4_096)
        throw new Error("Caller v2 reply exceeded size limit");
      if (!headerParsed) {
        const newline = raw.indexOf("\n");
        if (newline < 0) continue;
        headerParsed = true;
        const header =
          /^\s*([+-]?[01])\s+(calm|anxious|panic|anger|confusion|pain|neutral)\s*$/u.exec(
            raw.slice(0, newline).replace(/\r$/u, ""),
          );
        if (!header) continue;
        validHeader = true;
        panicShift = Number(header[1]) as -1 | 0 | 1;
        emotion = header[2] as CallerEmotion;
        pendingReply = raw.slice(newline + 1).replace(/^\s+/u, "");
        yield { type: "text.delta", delta: '{"text":"' };
        if (pendingReply) {
          yield {
            type: "text.delta",
            delta: JSON.stringify(pendingReply).slice(1, -1),
          };
          pendingReply = "";
        }
        continue;
      }
      if (validHeader) {
        yield {
          type: "text.delta",
          delta: JSON.stringify(event.delta).slice(1, -1),
        };
      }
      continue;
    }

    if (!validHeader) {
      const parsed = parseCallerV2Reply(raw);
      warn(
        "Caller v2 returned an invalid header; using the whole response as speech",
      );
      yield {
        type: "text.delta",
        delta: JSON.stringify(
          CallerReplySchema.parse({
            text: parsed.text,
            emotion: parsed.emotion,
            panicShift: parsed.panicShift,
            intensity: fallback?.intensity ?? 0.5,
            speechRate: fallback?.speechRate ?? 1,
            revealedFactIds: [],
            endCall: fallback?.endCall ?? false,
          }),
        ),
      };
    } else {
      yield {
        type: "text.delta",
        delta:
          `","emotion":${JSON.stringify(emotion)},` +
          `"intensity":${fallback?.intensity ?? 0.5},` +
          `"speechRate":${fallback?.speechRate ?? 1},` +
          '"revealedFactIds":[],"endCall":' +
          `${fallback?.endCall ?? false},"panicShift":${panicShift}}`,
      };
    }
    yield event;
  }
}
