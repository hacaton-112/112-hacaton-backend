import { ConfigService } from "@nestjs/config";
import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";
import type { StructuredOutputRequest } from "@/modules/ai-gateway/ports/structured-output.port";
import { createAiProviders } from "@/modules/ai-gateway/infrastructure/text-ai-adapter.module";
import {
  buildReplyPrompt,
  LocalLlmAdapter,
  LocalLlmConfigSchema,
} from "@/modules/ai-gateway/infrastructure/local-llm/local-llm.adapter";

const MAX_PROMPT_LENGTH = 2_000;

const config = LocalLlmConfigSchema.parse({
  baseUrl: "http://127.0.0.1:8080/v1/",
  model: "training-model",
});
/**
 * Запас на двоих: последний слот адаптер держит для живого звонка, поэтому
 * инструменты преподавателя работают только когда слотов больше одного.
 */
const toolingConfig = LocalLlmConfigSchema.parse({
  baseUrl: "http://127.0.0.1:8080/v1/",
  model: "training-model",
  concurrency: 2,
});
const request: StructuredOutputRequest = {
  schemaName: "test",
  schemaDescription: "Test",
  schema: { type: "object" },
  systemPrompt: "Return JSON",
  userPrompt: "Synthetic test",
  maxTokens: 128,
  signal: new AbortController().signal,
};
const response = () =>
  Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });

describe(LocalLlmAdapter.name, () => {
  it("keeps the legacy reply protocol by default", () => {
    expect(config.replyProtocol).toBe("legacy");
  });
  it.each([true, false])(
    "exposes local style policy with literal mode %s",
    (literalFactReplies) => {
      expect(
        new LocalLlmAdapter({ ...config, literalFactReplies }).replyPolicy,
      ).toEqual({
        retryNearRepetition: false,
        preserveLiteralText: literalFactReplies,
      });
    },
  );
  it.each([400, 408, 429])(
    "marks HTTP %s non-retryable to prevent duplicate inference",
    async (status) => {
      const fetcher = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(new Response("unavailable", { status }));
      await expect(
        new LocalLlmAdapter(toolingConfig, fetcher).complete(request),
      ).rejects.toMatchObject({ status, retryable: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("uses a bounded classifier schema without fixed slots or creative sampling", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        Response.json({
          choices: [
            { message: { content: '{"askedFactIds":["age","invented"]}' } },
          ],
        }),
      );
    const adapter = new LocalLlmAdapter(config, fetcher);
    await expect(
      adapter.understand(
        {
          requestId: "intent",
          operatorText: "Не спрашиваю адрес, скажите возраст",
          facts: [
            {
              id: "age",
              label: "Возраст",
              question: "Сколько лет пострадавшему?",
            },
          ],
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual(["age"]);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ temperature: 0, cache_prompt: true });
    expect(body).not.toHaveProperty("id_slot");
    expect(body).not.toHaveProperty("presence_penalty");
    expect(
      body.response_format.json_schema.schema.properties.askedFactIds.items
        .enum,
    ).toEqual(["age"]);
  });
  it("rejects an invalid empty fact catalogue before inference", async () => {
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    await expect(
      new LocalLlmAdapter(config, fetcher).understand(
        {
          requestId: "empty",
          operatorText: "Где вы?",
          facts: [],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("streams compact replies with engine-owned style and restores literal instructions", async () => {
    const delta = JSON.stringify({
      choices: [
        {
          index: 0,
          delta: {
            content: '{"t":"Во дворе.","f":[1]}',
          },
        },
      ],
    });
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(
        async () =>
          new Response("data: " + delta + "\n\ndata: [DONE]\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
      );
    const adapter = new LocalLlmAdapter(
      { ...config, literalFactReplies: true },
      fetcher,
    );
    const request: GenerateCallerReplyRequest = {
      requestId: "reply",
      sessionId: "session",
      scenarioVersionId: "version",
      operatorText: "Где вы?",
      context: {
        persona: {
          id: "caller",
          description: "Учебный заявитель",
          language: "Russian",
        },
        allowedFacts: [{ id: "place", value: "Во дворе." }],
        recentTurns: [],
      },
      fallbackReply: {
        text: "Во дворе.",
        revealedFactIds: ["place"],
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        endCall: false,
      },
    };
    const events: LlmStreamEvent[] = [];
    for await (const event of adapter.streamReply(
      request,
      new AbortController().signal,
    ))
      events.push(event);
    const wire = events
      .filter((event) => event.type === "text.delta")
      .map((event) => event.delta)
      .join("");
    expect(JSON.parse(wire)).toEqual(request.fallbackReply);
    expect(events.at(-1)?.type).toBe("response.completed");
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body.response_format.json_schema.schema.required).toEqual([
      "t",
      "f",
    ]);
    expect(body.messages[0].content).toContain("{t, f}");
    expect(body.messages[0].content).toContain("дословно");
    // Промпт своей модели держим коротким: на процессоре каждая лишняя
    // сотня знаков — это задержка ответа заявителя.
    expect(body.messages[0].content.length).toBeLessThan(MAX_PROMPT_LENGTH);
    expect(body.max_tokens).toBe(256);
    expect(body).toMatchObject({
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
    });
    expect(body).not.toHaveProperty("id_slot");
    expect(body.messages[1].content).toContain("1. Во дворе.");
    expect(body.messages[1].content).toContain("ДОСЛОВНЫЙ ОТВЕТ:\nВо дворе.");
    expect(body.messages[1].content).not.toContain("СОСТОЯНИЕ:");
    expect(body.messages[1].content).not.toContain("place");
    expect(body.messages[1].content).not.toContain("operatorText");

    for await (const _event of adapter.streamReply(
      { ...request, retryFeedback: "Сформулируй иначе" },
      new AbortController().signal,
    )) {
      // Consume the retry stream to inspect its provider request.
    }
    const retryBody = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(retryBody).toMatchObject({
      chat_template_kwargs: { enable_thinking: true },
      reasoning_effort: "low",
    });
  });
  it("uses the exact caller-v2 request without a JSON grammar", async () => {
    const delta = JSON.stringify({
      choices: [{ index: 0, delta: { content: "0 panic\nПожар!" } }],
    });
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response("data: " + delta + "\n\ndata: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const callerRequest: GenerateCallerReplyRequest = {
      requestId: "caller-v2",
      sessionId: "session",
      scenarioVersionId: "version",
      operatorText: "Что случилось?",
      replyProtocol: "caller-v2",
      panicLevel: 3,
      callerTurns: 0,
      context: {
        persona: {
          id: "caller",
          description: "Мужчина, свидетель.",
          language: "Russian",
        },
        allowedFacts: [{ id: "incident", value: "Пожар." }],
        recentTurns: [],
      },
    };
    const events: LlmStreamEvent[] = [];
    for await (const event of new LocalLlmAdapter(
      { ...config, replyProtocol: "caller-v2" },
      fetcher,
    ).streamReply(callerRequest, new AbortController().signal)) {
      events.push(event);
    }
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      model: "training-model",
      stream: true,
      temperature: 0.3,
      max_tokens: 100,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
      cache_prompt: true,
      messages: [
        {
          role: "system",
          content:
            "Ты заявитель: сам звонишь в 112 за помощью. Ты не оператор и не диспетчер. Отвечай только на последнюю реплику оператора и только тем, что знаешь.",
        },
        {
          role: "user",
          content:
            "Ты: Мужчина, свидетель.\nЗнаешь:\n- Пожар.\nРазговор:\n(начало)\nСейчас: в панике, отвечает одним-двумя предложениями и сбивается на отдельных словах\nОператор: Что случилось?",
        },
      ],
    });
    expect(body).not.toHaveProperty("response_format");
    expect(
      events.map((event) => ("delta" in event ? event.delta : "")).join(""),
    ).not.toContain("0 panic");
  });
  it("lets the model word the turn instead of rephrasing the engine sentence", async () => {
    const delta = JSON.stringify({
      choices: [
        { index: 0, delta: { content: '{"t":"Я во дворе стою!","f":[1]}' } },
      ],
    });
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(
        async () =>
          new Response("data: " + delta + "\n\ndata: [DONE]\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
      );
    const request: GenerateCallerReplyRequest = {
      requestId: "reply",
      sessionId: "session",
      scenarioVersionId: "version",
      operatorText: "Где вы находитесь?",
      context: {
        persona: {
          id: "caller",
          description: "Учебный заявитель",
          language: "Russian",
        },
        allowedFacts: [{ id: "place", value: "Во дворе." }],
        recentTurns: [],
        turnPlan: {
          reactionAct: "answer",
          focusFactIds: ["place"],
          minimumResponseDelayMs: 300,
        },
      },
      fallbackReply: {
        text: "Во дворе.",
        revealedFactIds: ["place"],
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        endCall: false,
      },
    };

    for await (const _event of new LocalLlmAdapter(config, fetcher).streamReply(
      request,
      new AbortController().signal,
    )) {
      // Consume the stream to inspect the provider request.
    }

    const prompt = JSON.parse(fetcher.mock.calls[0]![1]!.body as string)
      .messages[1].content as string;
    // Раньше движок диктовал предложение, и модель его переписывала.
    expect(prompt).not.toContain("ОТВЕТЬ ТАК ЖЕ ПО СМЫСЛУ");
    expect(prompt).not.toContain("ДОСЛОВНЫЙ ОТВЕТ");
    expect(prompt).toContain("КАК ОТВЕЧАТЬ:");
    expect(prompt).toContain("ДОПУСТИМЫЕ СВЕДЕНИЯ:\n1. Во дворе.");
    expect(prompt).not.toContain("reactionAct");
    // Номер вместо значения 0.6B произносит буквально: «сведения № 1»
    // давало реплику «1» в пробе на живой модели.
    expect(prompt).toContain("СКАЖИ СЕЙЧАС ОБ ЭТОМ:\nВо дворе.");
    expect(prompt).not.toContain("сведения № ");
  });
  it("names the asked topic the scenario still withholds", async () => {
    const delta = JSON.stringify({
      choices: [
        { index: 0, delta: { content: '{"t":"Я не знаю код!","f":[]}' } },
      ],
    });
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(
        async () =>
          new Response("data: " + delta + "\n\ndata: [DONE]\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
      );
    const request: GenerateCallerReplyRequest = {
      requestId: "reply",
      sessionId: "session",
      scenarioVersionId: "version",
      operatorText: "Какой код домофона?",
      context: {
        persona: {
          id: "caller",
          description: "Учебный заявитель",
          language: "Russian",
        },
        allowedFacts: [],
        recentTurns: [],
        withheldTopics: ["Код домофона"],
        turnPlan: { reactionAct: "clarify", minimumResponseDelayMs: 300 },
      },
    };

    for await (const _event of new LocalLlmAdapter(config, fetcher).streamReply(
      request,
      new AbortController().signal,
    )) {
      // Consume the stream to inspect the provider request.
    }

    const prompt = JSON.parse(fetcher.mock.calls[0]![1]!.body as string)
      .messages[1].content as string;
    expect(prompt).toContain("«Код домофона»");
    // Перечисленный списком ярлык модель просто зачитывала вслух.
    expect(prompt).toContain("Сам ярлык не произноси.");
    // Название темы — не её значение: раскрыть закрытый факт по нему нельзя.
    expect(prompt).not.toContain("withheldTopics");
  });
  it("keeps the prompt prefix stable while the delivery changes", () => {
    const turn = (
      deliveryHint: string,
      recentTurns: GenerateCallerReplyRequest["context"]["recentTurns"],
    ): GenerateCallerReplyRequest => ({
      requestId: "reply",
      sessionId: "session",
      scenarioVersionId: "version",
      operatorText: "Что происходит?",
      context: {
        persona: {
          id: "caller",
          description: "Мужчина, 34 года. Волнение. Говорит рублеными фразами.",
          language: "Russian",
        },
        allowedFacts: [{ id: "place", value: "Во дворе." }],
        recentTurns,
        deliveryHint,
        turnPlan: { reactionAct: "answer", minimumResponseDelayMs: 300 },
      },
    });

    const first = buildReplyPrompt(
      turn("Сейчас он взвинчен.", [{ role: "operator", text: "Слушаю вас." }]),
    );
    const second = buildReplyPrompt(
      turn("Сейчас он в панике.", [
        { role: "operator", text: "Слушаю вас." },
        { role: "caller", text: "Я во дворе!" },
      ]),
    );

    let shared = 0;
    while (
      shared < first.length &&
      shared < second.length &&
      first[shared] === second[shared]
    ) {
      shared += 1;
    }

    // Общий префикс — это ровно то, что llama-server переиспользует из KV-кеша.
    // Пока подача стояла в персоне, он обрывался на первых же символах.
    expect(first.slice(0, shared)).toContain("Мужчина, 34 года");
    expect(first.slice(0, shared)).toContain("Слушаю вас.");
    expect(first.indexOf("КАК ЗВУЧИТ СЕЙЧАС:")).toBeGreaterThan(
      first.indexOf("ДОПУСТИМЫЕ СВЕДЕНИЯ:"),
    );
  });
  it("uses a local model name, structured output and non-thinking mode without cloud headers", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(toolingConfig, fetcher);
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "training-model",
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
    });
    expect(init!.headers).toEqual({ "Content-Type": "application/json" });
    expect(init!.redirect).toBe("error");
  });
  it("rejects excess work immediately, then releases the slot", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(toolingConfig, fetcher);
    const first = adapter.complete(request);
    await expect(adapter.complete(request)).rejects.toMatchObject({
      status: 429,
      retryable: false,
    });
    resolve(response());
    await first;
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("releases slots after provider errors and never retries through cloud", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(toolingConfig, fetcher);
    await expect(adapter.complete(request)).rejects.toThrow("offline");
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    expect(
      fetcher.mock.calls.every(
        ([url]) => url === "http://127.0.0.1:8080/v1/chat/completions",
      ),
    ).toBe(true);
  });
  it("supports local startup without cloud credentials and shares the concurrency budget", () => {
    const providers = createAiProviders(
      new ConfigService({
        LLM_PROVIDER: "local",
        LLM_BASE_URL: config.baseUrl,
        LLM_MODEL: config.model,
      }),
      jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(),
    );
    expect(providers.llm).toBeInstanceOf(LocalLlmAdapter);
    expect(providers.llm).toBe(providers.questions);
    expect(providers.llm).toBe(providers.structured);
  });
  it("routes structured work to an independent tools model", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response());
    const providers = createAiProviders(
      new ConfigService({
        LLM_PROVIDER: "local",
        LLM_BASE_URL: config.baseUrl,
        LLM_MODEL: config.model,
        TOOLS_LLM_BASE_URL: "http://127.0.0.1:8081/v1",
        TOOLS_LLM_MODEL: "tools-model-v2",
        TOOLS_LLM_TIMEOUT_MS: 120_000,
        TOOLS_LLM_CONCURRENCY: 1,
      }),
      fetcher,
    );

    expect(providers.llm).toBe(providers.questions);
    expect(providers.structured).toBeInstanceOf(LocalLlmAdapter);
    expect(providers.structured).not.toBe(providers.llm);

    await expect(providers.structured.complete(request)).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8081/v1/chat/completions");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: "tools-model-v2",
    });
  });
  it("keeps the tools model separate from the dialogue model", () => {
    const providers = createAiProviders(
      new ConfigService({
        LLM_BASE_URL: "http://127.0.0.1:8080/v1",
        LLM_MODEL: "dialogue-model",
        TOOLS_LLM_BASE_URL: "http://127.0.0.1:8081/v1",
      }),
      jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(),
    );

    expect(providers.structured).toBeInstanceOf(LocalLlmAdapter);
    expect(providers.structured).not.toBe(providers.llm);
    expect(providers.structured).not.toBe(providers.questions);
  });
  it("validates configuration and rejects already cancelled work before fetch", async () => {
    expect(
      LocalLlmConfigSchema.safeParse({ ...config, concurrency: 0 }).success,
    ).toBe(false);
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    await expect(
      new LocalLlmAdapter(config, fetcher).complete({
        ...request,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps the only slot for the live call", async () => {
    // Проверка грамотности и помощник сценария ждут: заявитель не должен
    // переходить на запасную реплику из-за действия в соседнем кабинете.
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();

    await expect(
      new LocalLlmAdapter(config, fetcher).complete(request),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
