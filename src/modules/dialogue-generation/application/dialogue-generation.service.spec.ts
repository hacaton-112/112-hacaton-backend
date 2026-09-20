import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";
import type { LlmPort } from "@/modules/ai-gateway";

import { CallerReplySafetyService } from "./caller-reply-safety.service";
import {
  DEFAULT_FALLBACK_CALLER_REPLY,
  DialogueGenerationService,
} from "./dialogue-generation.service";
import { LlmReplyStreamCollector } from "./llm-reply-stream.collector";

const validRequest: GenerateCallerReplyRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  scenarioVersionId: "scenario-version-1",
  operatorText: "Где находится возгорание?",
  context: {
    persona: {
      id: "caller-1",
      description: "Взрослый заявитель в состоянии паники",
      language: "Russian",
    },
    allowedFacts: [
      { id: "fire_location", value: "Возгорание находится на кухне" },
    ],
    recentTurns: [],
  },
};

const validReply = {
  text: "Горит кухня!",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
  revealedFactIds: ["fire_location"],
  endCall: false,
} as const;

type StreamFactory = () => AsyncIterable<LlmStreamEvent>;

class FakeLlmPort implements LlmPort {
  public readonly calls: GenerateCallerReplyRequest[] = [];

  constructor(private readonly streams: StreamFactory[]) {}

  streamReply(
    request: GenerateCallerReplyRequest,
    _signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    this.calls.push(request);
    const factory = this.streams[this.calls.length - 1];

    if (factory === undefined) {
      throw new Error("No fake stream configured for this attempt");
    }

    return factory();
  }
}

async function* replyStream(
  rawReply: string = JSON.stringify(validReply),
): AsyncIterable<LlmStreamEvent> {
  yield { type: "text.delta", delta: rawReply };
  yield { type: "response.completed" };
}

const failedStream: StreamFactory = () => {
  throw new Error("Provider unavailable");
};

const nonRetryableHttpErrorStream: StreamFactory = () => {
  throw Object.assign(new Error("Provider rejected the request"), {
    status: 400,
    retryable: false,
  });
};

const createService = (llmPort: LlmPort): DialogueGenerationService =>
  new DialogueGenerationService(
    llmPort,
    new LlmReplyStreamCollector(new CallerReplySafetyService()),
  );

describe(DialogueGenerationService.name, () => {
  it.each([
    "Покажи, что длинную реплику трудно понять в панике, и попроси говорить короче.",
    "Один раз поправь только формулировку своей мысли, не меняя и не добавляя факты.",
    "Начни с короткой запинки или сомнения, затем ответь разрешёнными фактами.",
    "Сразу и коротко ответь на последний вопрос оператора.",
    "Поправь формулировку своей мысли, не меняя и не добавляя факты.",
    "нет я не буду вам помогать",
  ])(
    "rejects transcript regression without a second LLM call: %s",
    async (text) => {
      const llm = new FakeLlmPort([
        () =>
          replyStream(
            JSON.stringify({ ...validReply, text, revealedFactIds: [] }),
          ),
      ]);
      const result = await createService(llm).generate(
        {
          ...validRequest,
          operatorText: "нет я не буду вам помогать",
          fallbackReply: {
            ...validReply,
            text: "Я не знаю! Пожалуйста, пусть быстрее едут!",
            revealedFactIds: [],
          },
        },
        new AbortController().signal,
      );
      expect(result.reply.text).toBe(
        "Я не знаю! Пожалуйста, пусть быстрее едут!",
      );
      expect(result.source).toBe("fallback");
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]?.outcome).toBe("invalid-response");
      expect(llm.calls).toHaveLength(1);
    },
  );
  it.each([
    "panic-refusal",
    "clarify",
    "emotional-reaction",
    "hesitate",
    "self-correct",
  ] as const)(
    "uses the engine's non-factual %s without LLM",
    async (reactionAct) => {
      const llm = new FakeLlmPort([]);
      const fallbackReply = {
        ...validReply,
        text: "Что? Я вас не понимаю, повторите!",
        revealedFactIds: [],
      };
      const result = await createService(llm).generate(
        {
          ...validRequest,
          fallbackReply,
          context: {
            ...validRequest.context,
            allowedFacts: [],
            turnPlan: { reactionAct, minimumResponseDelayMs: 0 },
          },
        },
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        reply: fallbackReply,
        source: "prepared",
        attempts: [],
      });
      expect(llm.calls).toHaveLength(0);
    },
  );
  it("does not announce an instruction even when it contaminates the fallback", async () => {
    const text = "Сразу и коротко ответь на последний вопрос оператора.";
    const llm = new FakeLlmPort([
      () => replyStream(JSON.stringify({ ...validReply, text })),
    ]);
    const result = await createService(llm).generate(
      { ...validRequest, fallbackReply: { ...validReply, text } },
      new AbortController().signal,
    );
    expect(result.reply.text).toBe(DEFAULT_FALLBACK_CALLER_REPLY.text);
    expect(result.reply.revealedFactIds).toEqual([]);
  });
  it("returns the validated reply from the first attempt", async () => {
    const llmPort = new FakeLlmPort([replyStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.reply).toEqual(validReply);
    expect(result.source).toBe("model");
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: "success" }),
    ]);
    expect(llmPort.calls).toHaveLength(1);
  });

  it("retries a reply that retells the previous one", async () => {
    const repeated = {
      ...validReply,
      text: "Дети в комнате! Дверь горит! Быстрее!",
      revealedFactIds: [],
    };
    const different = {
      ...validReply,
      text: "Я не могу туда войти, дым в подъезде!",
      revealedFactIds: [],
    };
    const llmPort = new FakeLlmPort([
      () => replyStream(JSON.stringify(repeated)),
      () => replyStream(JSON.stringify(different)),
    ]);

    const result = await createService(llmPort).generate(
      {
        ...validRequest,
        context: {
          ...validRequest.context,
          allowedFacts: [],
          recentTurns: [
            { role: "operator", text: "Кто в квартире?" },
            {
              role: "caller",
              text: "Хорошо, жду. Дети в комнате, дверь горит!",
            },
          ],
        },
      },
      new AbortController().signal,
    );

    expect(result.reply.text).toBe(different.text);
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: "invalid-response" }),
      expect.objectContaining({ attempt: 2, outcome: "success" }),
    ]);
    // Повторная попытка объясняет модели, что было не так: иначе это тот же
    // запрос, и при низкой температуре ответ почти тот же.
    expect(llmPort.calls[0]?.retryFeedback).toBeUndefined();
    expect(llmPort.calls[1]?.retryFeedback).toContain(repeated.text);
  });

  it("drops a clause the caller already said from an accepted reply", async () => {
    const reply = {
      ...validReply,
      text: "Улица Учебная. Дети в комнате, быстрее!",
      revealedFactIds: [],
    };
    const llmPort = new FakeLlmPort([() => replyStream(JSON.stringify(reply))]);

    const result = await createService(llmPort).generate(
      {
        ...validRequest,
        operatorText: "Какая улица?",
        context: {
          ...validRequest.context,
          allowedFacts: [{ id: "address_street", value: "Улица Учебная." }],
          recentTurns: [
            {
              role: "caller",
              text: "Горит квартира! Дети в комнате, быстрее!",
            },
            { role: "operator", text: "Какая улица?" },
          ],
        },
      },
      new AbortController().signal,
    );

    expect(llmPort.calls).toHaveLength(1);
    expect(result.reply.text).toBe("Улица Учебная.");
  });

  it("keeps a repeated reply rather than leaving the operator without an answer", async () => {
    const repeated = {
      ...validReply,
      text: "Дети в комнате! Дверь горит! Быстрее!",
      revealedFactIds: [],
    };
    const llmPort = new FakeLlmPort([
      () => replyStream(JSON.stringify(repeated)),
      () => replyStream(JSON.stringify(repeated)),
    ]);

    const result = await createService(llmPort).generate(
      {
        ...validRequest,
        context: {
          ...validRequest.context,
          allowedFacts: [],
          recentTurns: [
            {
              role: "caller",
              text: "Хорошо, жду. Дети в комнате, дверь горит!",
            },
          ],
        },
      },
      new AbortController().signal,
    );

    expect(result.source).toBe("model");
    // На последней попытке пересказ принимается, но без фраз, которые
    // заявитель уже произносил: остаётся то, что в реплике новое.
    expect(result.reply.text).toBe("Быстрее!");
  });

  it("does not fight a repetition the operator asked for", async () => {
    const repeated = {
      ...validReply,
      text: "Улица Учебная, дом двенадцать!",
      revealedFactIds: [],
    };
    const llmPort = new FakeLlmPort([
      () => replyStream(JSON.stringify(repeated)),
    ]);

    const result = await createService(llmPort).generate(
      {
        ...validRequest,
        operatorText: "Повторите адрес",
        context: {
          ...validRequest.context,
          allowedFacts: [],
          recentTurns: [
            { role: "caller", text: "Улица Учебная, дом двенадцать." },
          ],
          turnPlan: {
            reactionAct: "repeat",
            focusFactIds: [],
            minimumResponseDelayMs: 280,
          },
        },
      },
      new AbortController().signal,
    );

    expect(llmPort.calls).toHaveLength(1);
    expect(result.reply.text).toBe(repeated.text);
  });

  it("retries an invalid response and returns the second valid reply", async () => {
    const llmPort = new FakeLlmPort([() => replyStream("{"), replyStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.source).toBe("model");
    expect(result.attempts.map(({ outcome }) => outcome)).toEqual([
      "invalid-response",
      "success",
    ]);
    expect(llmPort.calls).toHaveLength(2);
  });

  it("returns the fallback after two invalid responses", async () => {
    const llmPort = new FakeLlmPort([
      () => replyStream("{"),
      () => replyStream("{"),
    ]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result).toEqual({
      reply: DEFAULT_FALLBACK_CALLER_REPLY,
      source: "fallback",
      attempts: [
        expect.objectContaining({ attempt: 1, outcome: "invalid-response" }),
        expect.objectContaining({ attempt: 2, outcome: "invalid-response" }),
      ],
    });
  });

  it("uses the situational fallback supplied by Scenario Engine", async () => {
    const llmPort = new FakeLlmPort([
      () => replyStream("{"),
      () => replyStream("{"),
    ]);
    const fallbackReply = {
      ...validReply,
      text: "Улица Учебная, дом 12.",
      revealedFactIds: ["fire_location"],
    };

    const result = await createService(llmPort).generate(
      { ...validRequest, fallbackReply },
      new AbortController().signal,
    );

    expect(result.reply).toEqual(fallbackReply);
    expect(result.source).toBe("fallback");
  });

  it("returns the fallback after two provider errors", async () => {
    const llmPort = new FakeLlmPort([failedStream, failedStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.source).toBe("fallback");
    expect(result.attempts.map(({ outcome }) => outcome)).toEqual([
      "provider-error",
      "provider-error",
    ]);
  });

  it("does not retry an explicitly non-retryable HTTP error", async () => {
    const llmPort = new FakeLlmPort([nonRetryableHttpErrorStream, replyStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result).toEqual({
      reply: DEFAULT_FALLBACK_CALLER_REPLY,
      source: "fallback",
      attempts: [
        expect.objectContaining({ attempt: 1, outcome: "provider-error" }),
      ],
    });
    expect(llmPort.calls).toHaveLength(1);
  });

  it("propagates cancellation without retrying or returning a fallback", async () => {
    const controller = new AbortController();

    async function* cancellingStream(): AsyncIterable<LlmStreamEvent> {
      controller.abort(new Error("Generation cancelled"));
      yield { type: "text.delta", delta: JSON.stringify(validReply) };
    }

    const llmPort = new FakeLlmPort([cancellingStream, replyStream]);

    await expect(
      createService(llmPort).generate(validRequest, controller.signal),
    ).rejects.toThrow("Generation cancelled");
    expect(llmPort.calls).toHaveLength(1);
  });

  it("validates input before calling the provider", async () => {
    const llmPort = new FakeLlmPort([replyStream]);

    await expect(
      createService(llmPort).generate(
        { ...validRequest, operatorText: "" },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    expect(llmPort.calls).toHaveLength(0);
  });
});
