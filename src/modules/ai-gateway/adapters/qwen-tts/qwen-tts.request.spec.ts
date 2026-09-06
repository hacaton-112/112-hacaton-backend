import { CallerEmotionSchema, type TtsSynthesisRequest } from "@/contracts";

import type { QwenTtsConfig } from "./qwen-tts.config";
import {
  QWEN_TTS_MAX_TOKENS,
  buildQwenTtsInstruction,
  buildQwenTtsRequest,
  mapQwenTtsIntensity,
} from "./qwen-tts.request";

const config: QwenTtsConfig = {
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
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
};

describe(buildQwenTtsRequest.name, () => {
  it("builds the exact streaming MLX-Audio request", () => {
    expect(buildQwenTtsRequest(request, config)).toEqual({
      model: config.model,
      input: request.text,
      voice: request.voiceId,
      speed: request.speechRate,
      lang_code: "Russian",
      instruct:
        "Говори в панике, сбивчиво и напряжённо. Выраженность эмоции: сильная.",
      response_format: "pcm",
      stream: true,
      streaming_interval: config.streamingIntervalSeconds,
      max_tokens: QWEN_TTS_MAX_TOKENS,
      verbose: false,
    });
  });

  it("does not expose internal identifiers", () => {
    const serialized = JSON.stringify(buildQwenTtsRequest(request, config));

    expect(serialized).not.toContain(request.requestId);
    expect(serialized).not.toContain(request.sessionId);
  });

  it.each([
    [0, "слабая"],
    [0.33, "слабая"],
    [0.34, "средняя"],
    [0.66, "средняя"],
    [0.67, "сильная"],
    [1, "сильная"],
  ] as const)("maps intensity %s to %s", (intensity, level) => {
    expect(mapQwenTtsIntensity(intensity)).toBe(level);
  });

  it.each(CallerEmotionSchema.options)(
    "builds a deterministic instruction for %s",
    (emotion) => {
      const first = buildQwenTtsInstruction(emotion, 0.5);
      const second = buildQwenTtsInstruction(emotion, 0.5);

      expect(first).toBe(second);
      expect(first).toContain("Выраженность эмоции: средняя.");
    },
  );

  it("validates the domain request before mapping", () => {
    expect(() =>
      buildQwenTtsRequest({ ...request, speechRate: 3 }, config),
    ).toThrow();
  });
});
