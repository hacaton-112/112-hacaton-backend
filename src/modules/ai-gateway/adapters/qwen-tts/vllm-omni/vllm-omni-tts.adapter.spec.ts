import type { AudioChunk, TtsSynthesisRequest } from "@/contracts";

import type { VllmOmniTtsConfig } from "./vllm-omni-tts.config";
import { VllmOmniTtsAdapter } from "./vllm-omni-tts.adapter";

const config: VllmOmniTtsConfig = {
  provider: "vllm-omni",
  baseUrl: "http://127.0.0.1:8091",
  model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
  requestTimeoutMs: 60_000,
};

const request: TtsSynthesisRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  text: "На кухне сильный дым!",
  language: "Russian",
  voiceId: "Vivian",
  gender: "male",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.25,
};

const createFetchMock = (): jest.MockedFunction<typeof fetch> =>
  jest.fn() as jest.MockedFunction<typeof fetch>;

const pcmResponse = (chunks: readonly Uint8Array[]): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "audio/pcm; charset=binary" },
    },
  );

const collect = async (
  adapter: VllmOmniTtsAdapter,
  signal: AbortSignal = new AbortController().signal,
): Promise<AudioChunk[]> => {
  const chunks: AudioChunk[] = [];

  for await (const chunk of adapter.synthesize(request, signal)) {
    chunks.push(chunk);
  }

  return chunks;
};

describe(VllmOmniTtsAdapter.name, () => {
  it("streams raw PCM with the vLLM Omni request contract", async () => {
    const audio = new Uint8Array([0, 1, 2, 3]);
    const fetchImplementation = createFetchMock().mockResolvedValue(
      pcmResponse([audio]),
    );
    const adapter = new VllmOmniTtsAdapter(config, fetchImplementation);

    await expect(collect(adapter)).resolves.toEqual([
      expect.objectContaining({
        streamId: request.requestId,
        sequence: 0,
        sampleRate: 24_000,
        channels: 1,
        format: "pcm_s16le",
        isFinal: true,
        audio,
      }),
    ]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://127.0.0.1:8091/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "audio/pcm",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: request.text,
          voice: "vivian",
          task_type: "CustomVoice",
          language: "Russian",
          instructions:
            "Сохраняй естественный голос выбранного диктора: не меняй тембр, высоту голоса, возраст и акцент. Меняй только эмоциональную подачу. Точно произноси заданный текст: не добавляй, не пропускай и не заменяй слова. Не переходи на крик или фальцет и не вставляй стоны, вздохи и другие неречевые звуки. Подача срочная и испуганная, со слегка сбившимся дыханием. Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым. Голос: мужской. Темп речи слегка ускоренный, без проглатывания слов.",
          response_format: "pcm",
          sample_rate: 24_000,
          stream: true,
          stream_format: "audio",
          max_new_tokens: 1_200,
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    [400, false],
    [408, true],
    [429, true],
    [500, true],
    [503, true],
  ])("classifies HTTP %i with retryable=%s", async (status, retryable) => {
    const sensitiveBody = `${request.text}; ${request.sessionId}`;
    const adapter = new VllmOmniTtsAdapter(
      config,
      createFetchMock().mockResolvedValue(
        new Response(sensitiveBody, { status }),
      ),
    );

    let thrown: unknown;

    try {
      await collect(adapter);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining({ code: "http-error", status, retryable }),
    );
    expect(String(thrown)).not.toContain(request.text);
    expect(String(thrown)).not.toContain(request.sessionId);
    expect(String(thrown)).not.toContain(sensitiveBody);
  });

  it("rejects an SSE response instead of decoding Base64 as PCM", async () => {
    const adapter = new VllmOmniTtsAdapter(
      config,
      createFetchMock().mockResolvedValue(
        new Response('data: {"type":"speech.audio.delta"}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("rejects an empty PCM stream", async () => {
    const adapter = new VllmOmniTtsAdapter(
      config,
      createFetchMock().mockResolvedValue(pcmResponse([])),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("preserves caller cancellation", async () => {
    const controller = new AbortController();
    const reason = new Error("Synthesis cancelled");
    controller.abort(reason);
    const adapter = new VllmOmniTtsAdapter(config, createFetchMock());

    await expect(collect(adapter, controller.signal)).rejects.toBe(reason);
  });

  it("sanitizes transport failures", async () => {
    const providerError = new Error(
      `provider leaked ${request.text} and ${request.sessionId}`,
    );
    const adapter = new VllmOmniTtsAdapter(
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
    expect(String(thrown)).not.toContain(request.text);
    expect(String(thrown)).not.toContain(request.sessionId);
  });

  it("converts provider timeout to a retryable sanitized error", async () => {
    const timeoutConfig: VllmOmniTtsConfig = {
      ...config,
      requestTimeoutMs: 1,
    };
    const fetchImplementation: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
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
    const adapter = new VllmOmniTtsAdapter(timeoutConfig, fetchImplementation);

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({
        code: "timeout",
        retryable: true,
      }),
    );
  });
});
