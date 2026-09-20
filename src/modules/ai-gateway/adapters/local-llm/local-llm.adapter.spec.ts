import { ConfigService } from "@nestjs/config";
import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";
import { ALICE_AI_SYSTEM_PROMPT } from "../alice-ai/alice-ai.request";
import type { StructuredOutputRequest } from "../alice-ai/alice-ai-structured-output.client";
import { createAiProviders } from "../alice-ai/alice-ai-adapter.module";
import { LocalLlmAdapter, LocalLlmConfigSchema } from "./local-llm.adapter";

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
            content: '{"text":"Во дворе.","revealedFactIds":["place"]}',
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
      "text",
      "revealedFactIds",
    ]);
    expect(body.messages[0].content).toContain("дословно");
    expect(body.messages[0].content.length).toBeLessThan(
      ALICE_AI_SYSTEM_PROMPT.length,
    );
    expect(body.max_tokens).toBe(128);
    expect(body).not.toHaveProperty("id_slot");
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
  it("supports local startup without Alice credentials and shares the concurrency budget", () => {
    const providers = createAiProviders(
      new ConfigService({
        LLM_PROVIDER: "local",
        LOCAL_LLM_BASE_URL: config.baseUrl,
        LOCAL_LLM_MODEL: config.model,
      }),
      jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(),
    );
    expect(providers.llm).toBeInstanceOf(LocalLlmAdapter);
    expect(providers.llm).toBe(providers.questions);
    expect(providers.llm).toBe(providers.structured);
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
