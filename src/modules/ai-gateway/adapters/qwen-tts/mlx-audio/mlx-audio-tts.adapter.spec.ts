import type { AudioChunk, TtsSynthesisRequest } from "@/contracts";

import type { MlxAudioTtsConfig } from "../qwen-tts.config";
import { MlxAudioTtsAdapter } from "./mlx-audio-tts.adapter";

const config: MlxAudioTtsConfig = {
  provider: "mlx-audio",
  baseUrl: "http://127.0.0.1:8000",
  model: "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit",
  streamingIntervalSeconds: 0.32,
  requestTimeoutMs: 60_000,
};

const request: TtsSynthesisRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  text: "На кухне сильный дым!",
  language: "Russian",
  voiceId: "vivian",
  gender: "male",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
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
  adapter: MlxAudioTtsAdapter,
  signal: AbortSignal = new AbortController().signal,
): Promise<AudioChunk[]> => {
  const chunks: AudioChunk[] = [];

  for await (const chunk of adapter.synthesize(request, signal)) {
    chunks.push(chunk);
  }

  return chunks;
};

describe(MlxAudioTtsAdapter.name, () => {
  it("sends the exact request and maps the raw PCM response", async () => {
    const audio = new Uint8Array([0, 1, 2, 3]);
    const fetchImplementation = createFetchMock().mockResolvedValue(
      pcmResponse([audio]),
    );
    const adapter = new MlxAudioTtsAdapter(config, fetchImplementation);

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
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "audio/pcm",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: request.text,
          voice: request.voiceId,
          gender: request.gender,
          speed: request.speechRate,
          lang_code: "Russian",
          instruct:
            "Сохраняй естественный голос выбранного диктора: не меняй тембр, высоту голоса, возраст и акцент. Меняй только эмоциональную подачу. Точно произноси заданный текст: не добавляй, не пропускай и не заменяй слова. Не переходи на крик или фальцет и не вставляй стоны, вздохи и другие неречевые звуки. Подача срочная и испуганная, со слегка сбившимся дыханием. Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым.",
          response_format: "pcm",
          stream: true,
          streaming_interval: config.streamingIntervalSeconds,
          max_tokens: 1_200,
          verbose: false,
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
    const adapter = new MlxAudioTtsAdapter(
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

  it("rejects a successful response with an unexpected content type", async () => {
    const adapter = new MlxAudioTtsAdapter(
      config,
      createFetchMock().mockResolvedValue(
        new Response(new Uint8Array([0, 1]), {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        }),
      ),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("rejects a successful response without a stream", async () => {
    const adapter = new MlxAudioTtsAdapter(
      config,
      createFetchMock().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "Content-Type": "audio/pcm" },
        }),
      ),
    );

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("rejects an empty response stream", async () => {
    const adapter = new MlxAudioTtsAdapter(
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
    const adapter = new MlxAudioTtsAdapter(config, createFetchMock());

    await expect(collect(adapter, controller.signal)).rejects.toBe(reason);
  });

  it("sanitizes transport failures", async () => {
    const providerError = new Error(
      `provider leaked ${request.text} and ${request.sessionId}`,
    );
    const adapter = new MlxAudioTtsAdapter(
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

  it("converts the provider timeout to a retryable sanitized error", async () => {
    const timeoutConfig: MlxAudioTtsConfig = {
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
    const adapter = new MlxAudioTtsAdapter(timeoutConfig, fetchImplementation);

    await expect(collect(adapter)).rejects.toEqual(
      expect.objectContaining({
        code: "timeout",
        retryable: true,
      }),
    );
  });
});
