import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";
import { CallerReplySafetyService } from "@/modules/dialogue-generation/application/caller-reply-safety.service";
import { LlmReplyStreamCollector } from "@/modules/dialogue-generation/application/llm-reply-stream.collector";
import {
  buildCallerV2Prompt,
  callerV2HistoryWindow,
  expandCallerV2Reply,
  parseCallerV2Reply,
} from "@/modules/ai-gateway/infrastructure/local-llm/caller-v2";

const request: GenerateCallerReplyRequest = {
  requestId: "request",
  sessionId: "session",
  scenarioVersionId: "version",
  operatorText: "Служба 112, что у вас случилось?",
  replyProtocol: "caller-v2",
  panicLevel: 3,
  callerTurns: 0,
  context: {
    persona: {
      id: "caller",
      description: "Мужчина, свидетель происшествия.",
      language: "Russian",
    },
    allowedFacts: [
      { id: "incident", value: "возгорание мусорного контейнера" },
      { id: "place", value: "Москва, Депо" },
      { id: "victims", value: "пострадавших нет" },
      { id: "caller_name", value: "Сидоров Иван Сергеевич" },
    ],
    recentTurns: [],
  },
  fallbackReply: {
    text: "Повторите, пожалуйста.",
    emotion: "anxious",
    intensity: 0.8,
    speechRate: 1.2,
    revealedFactIds: [],
    endCall: false,
  },
};

describe("caller-v2 protocol", () => {
  it("собирает обучающий промпт дословно", () => {
    expect(buildCallerV2Prompt(request)).toBe(
      "Ты: Мужчина, свидетель происшествия.\n" +
        "Знаешь:\n" +
        "- возгорание мусорного контейнера\n" +
        "- Москва, Депо\n" +
        "- пострадавших нет\n" +
        "- Меня зовут Сидоров Иван Сергеевич.\n" +
        "Разговор:\n" +
        "(начало)\n" +
        "Сейчас: в панике, отвечает одним-двумя предложениями и сбивается на отдельных словах\n" +
        "Оператор: Служба 112, что у вас случилось?",
    );
  });

  it("обрезает историю порциями до трёх стабильных размеров", () => {
    const turns = Array.from({ length: 18 }, (_, index) => ({
      role: index % 2 === 0 ? ("operator" as const) : ("caller" as const),
      text: `строка ${index}`,
    }));
    expect(callerV2HistoryWindow(turns, 5).map(({ text }) => text)).toEqual(
      turns.slice(-10).map(({ text }) => text),
    );
    expect(callerV2HistoryWindow(turns, 6).map(({ text }) => text)).toEqual(
      turns.slice(-6).map(({ text }) => text),
    );
    expect(callerV2HistoryWindow(turns, 7)).toHaveLength(8);
    expect(callerV2HistoryWindow(turns, 8)).toHaveLength(10);
    expect(callerV2HistoryWindow(turns, 9)).toHaveLength(6);
  });

  it("разбирает валидный ответ и сохраняет битый целиком", () => {
    expect(parseCallerV2Reply("0 panic\nПожар! Тут горит!")).toEqual({
      panicShift: 0,
      emotion: "panic",
      text: "Пожар! Тут горит!",
      validHeader: true,
    });
    expect(parseCallerV2Reply("сломанный заголовок\nНо это реплика")).toEqual({
      panicShift: 0,
      emotion: "neutral",
      text: "сломанный заголовок\nНо это реплика",
      validHeader: false,
    });
  });

  it("прячет заголовок, даже когда он разбит между SSE-чанками", async () => {
    async function* stream(): AsyncIterable<LlmStreamEvent> {
      for (const delta of [
        "-",
        "1 anx",
        "ious\nУчебная, ",
        "дом двенадцать.",
      ]) {
        yield { type: "text.delta", delta };
      }
      yield { type: "response.completed" };
    }
    const warnings: string[] = [];
    const collector = new LlmReplyStreamCollector(
      new CallerReplySafetyService(),
    );
    const result = await collector.collect(
      expandCallerV2Reply(stream(), request, (message) =>
        warnings.push(message),
      ),
      request.context.allowedFacts,
      new AbortController().signal,
      request,
    );
    expect(result.reply).toMatchObject({
      text: "Учебная, дом двенадцать.",
      panicShift: -1,
      emotion: "anxious",
    });
    expect(warnings).toEqual([]);
  });

  it("оставляет пустую реплику на существующий fallback", async () => {
    async function* stream(): AsyncIterable<LlmStreamEvent> {
      yield { type: "text.delta", delta: "0 calm\n   " };
      yield { type: "response.completed" };
    }
    const collector = new LlmReplyStreamCollector(
      new CallerReplySafetyService(),
    );
    await expect(
      collector.collect(
        expandCallerV2Reply(stream(), request, () => undefined),
        request.context.allowedFacts,
        new AbortController().signal,
        request,
      ),
    ).rejects.toThrow();
  });
});
