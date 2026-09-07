import type { TtsSynthesisRequest } from "@/contracts";

import type { VllmOmniTtsConfig } from "./vllm-omni-tts.config";
import {
  VLLM_OMNI_TTS_MAX_NEW_TOKENS,
  VllmOmniTtsSpeechRequestSchema,
  buildVllmOmniTtsRequest,
  mapVllmOmniSpeechRate,
  normalizeVllmOmniVoice,
} from "./vllm-omni-tts.request";

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
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.25,
};

describe(buildVllmOmniTtsRequest.name, () => {
  it("builds the exact raw PCM streaming request", () => {
    expect(buildVllmOmniTtsRequest(request, config)).toEqual({
      model: config.model,
      input: request.text,
      voice: "vivian",
      task_type: "CustomVoice",
      language: "Russian",
      instructions:
        "Говори в панике, сбивчиво и напряжённо. Выраженность эмоции: сильная. Темп речи: быстрый.",
      response_format: "pcm",
      sample_rate: 24_000,
      stream: true,
      stream_format: "audio",
      max_new_tokens: VLLM_OMNI_TTS_MAX_NEW_TOKENS,
    });
  });

  it("does not send MLX-only fields or internal identifiers", () => {
    const providerRequest = buildVllmOmniTtsRequest(request, config);
    const serialized = JSON.stringify(providerRequest);

    expect(providerRequest).not.toHaveProperty("speed");
    expect(providerRequest).not.toHaveProperty("lang_code");
    expect(providerRequest).not.toHaveProperty("instruct");
    expect(providerRequest).not.toHaveProperty("streaming_interval");
    expect(providerRequest).not.toHaveProperty("max_tokens");
    expect(providerRequest).not.toHaveProperty("verbose");
    expect(serialized).not.toContain(request.requestId);
    expect(serialized).not.toContain(request.sessionId);
  });

  it.each([
    [0.5, "медленный"],
    [0.84, "медленный"],
    [0.85, "обычный"],
    [1, "обычный"],
    [1.15, "обычный"],
    [1.16, "быстрый"],
    [2, "быстрый"],
  ] as const)("maps speech rate %s to %s", (speechRate, level) => {
    expect(mapVllmOmniSpeechRate(speechRate)).toBe(level);
  });

  it.each([
    ["Vivian", "vivian"],
    ["RYAN", "ryan"],
    ["custom_voice_1", "custom_voice_1"],
    ["CustomVoice", "CustomVoice"],
  ])("maps voice %s to %s", (voice, expected) => {
    expect(normalizeVllmOmniVoice(voice)).toBe(expected);
  });

  it("keeps the provider schema strict", () => {
    const validRequest = buildVllmOmniTtsRequest(request, config);

    expect(() =>
      VllmOmniTtsSpeechRequestSchema.parse({
        ...validRequest,
        streaming_interval: 0.32,
      }),
    ).toThrow();
  });
});
