import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";

import type { AliceAiConfig } from "./alice-ai.config";
import { AliceAiLlmAdapter } from "./alice-ai.adapter";

const config: AliceAiConfig = {
  apiKey: "test-api-key",
  folderId: "folder-1",
  baseUrl: "https://ai.api.cloud.yandex.net/v1",
  model: "aliceai-llm-flash",
  requestTimeoutMs: 5_000,
};

const request: GenerateCallerReplyRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  scenarioVersionId: "scenario-version-1",
  operatorText: "Что произошло?",
  context: {
    persona: {
      id: "caller-1",
      description: "Взволнованный взрослый заявитель",
      language: "Russian",
    },
    allowedFacts: [{ id: "fire", value: "На кухне пожар" }],
    recentTurns: [],
  },
};

const eventStreamResponse = (payload: string): Response =>
  new Response(payload, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });

const createFetchMock = (): jest.MockedFunction<typeof fetch> =>
  jest.fn() as jest.MockedFunction<typeof fetch>;

const collect = async (
  adapter: AliceAiLlmAdapter,
  signal: AbortSignal = new AbortController().signal,
): Promise<LlmStreamEvent[]> => {
  const events: LlmStreamEvent[] = [];

  for await (const event of adapter.streamReply(request, signal)) {
    events.push(event);
  }

  return events;
};

describe(AliceAiLlmAdapter.name, () => {
  it("sends the authenticated request and maps the response stream", async () => {
    const fetchImplementation = createFetchMock().mockResolvedValue(
      eventStreamResponse(
        [
          'data: {"choices":[{"index":0,"delta":{"content":"{\\"text\\""}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"content":"}"}}]}\n\n',
          "data: [DONE]\n\n",
        ].join(""),
      ),
    );
    const adapter = new AliceAiLlmAdapter(config, fetchImplementation);

    await expect(collect(adapter)).resolves.toEqual([
      { type: "text.delta", delta: '{"text"' },
      { type: "text.delta", delta: "}" },
      { type: "response.completed" },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://ai.api.cloud.yandex.net/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Api-Key test-api-key",
          "Content-Type": "application/json",
          "OpenAI-Project": "folder-1",
        },
        body: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    [400, false],
    [408, true],
    [429, true],
    [500, true],
  ])("classifies HTTP %i with retryable=%s", async (status, retryable) => {
    const sensitiveBody = `secret: ${config.apiKey}; ${request.operatorText}`;
    const fetchImplementation = createFetchMock().mockResolvedValue(
      new Response(sensitiveBody, { status }),
    );
    const adapter = new AliceAiLlmAdapter(config, fetchImplementation);

    let thrown: unknown;

    try {
      await collect(adapter);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining({
        code: "http-error",
        status,
        retryable,
      }),
    );
    expect(String(thrown)).not.toContain(config.apiKey);
    expect(String(thrown)).not.toContain(request.operatorText);
    expect(String(thrown)).not.toContain(sensitiveBody);
  });

  it("rejects a successful response with an unexpected content type", async () => {
    const adapter = new AliceAiLlmAdapter(
      config,
      createFetchMock().mockResolvedValue(new Response("{}", { status: 200 })),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("rejects a successful response without a body", async () => {
    const adapter = new AliceAiLlmAdapter(
      config,
      createFetchMock().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("preserves caller cancellation", async () => {
    const controller = new AbortController();
    const reason = new Error("Generation cancelled");
    controller.abort(reason);
    const adapter = new AliceAiLlmAdapter(config, createFetchMock());

    await expect(collect(adapter, controller.signal)).rejects.toBe(reason);
  });

  it("sanitizes transport failures", async () => {
    const providerError = new Error(
      `upstream leaked ${config.apiKey} and ${request.operatorText}`,
    );
    const adapter = new AliceAiLlmAdapter(
      config,
      createFetchMock().mockRejectedValue(providerError),
    );

    let thrown: unknown;

    try {
      await collect(adapter);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining({
        code: "transport-error",
        retryable: true,
      }),
    );
    expect(String(thrown)).not.toContain(config.apiKey);
    expect(String(thrown)).not.toContain(request.operatorText);
  });

  it("converts the internal timeout to a retryable provider error", async () => {
    const timeoutConfig: AliceAiConfig = { ...config, requestTimeoutMs: 1 };
    const fetchImplementation: typeof fetch = (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const requestSignal = init?.signal;

        if (requestSignal === null || requestSignal === undefined) {
          reject(new Error("Missing request signal"));
          return;
        }

        const rejectWithAbortReason = (): void => {
          reject(requestSignal.reason);
        };

        if (requestSignal.aborted) {
          rejectWithAbortReason();
          return;
        }

        requestSignal.addEventListener("abort", rejectWithAbortReason, {
          once: true,
        });
      });
    };
    const adapter = new AliceAiLlmAdapter(timeoutConfig, fetchImplementation);

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({
        code: "timeout",
        retryable: true,
      }),
    );
  });
});
