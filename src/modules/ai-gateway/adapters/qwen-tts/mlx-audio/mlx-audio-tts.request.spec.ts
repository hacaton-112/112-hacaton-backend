import type { TtsSynthesisRequest } from "@/contracts";

import type { MlxAudioTtsConfig } from "../qwen-tts.config";
import {
  MLX_AUDIO_TTS_MAX_TOKENS,
  buildMlxAudioTtsRequest,
} from "./mlx-audio-tts.request";

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

describe(buildMlxAudioTtsRequest.name, () => {
  it("builds the exact streaming MLX-Audio request", () => {
    expect(buildMlxAudioTtsRequest(request, config)).toEqual({
      model: config.model,
      input: request.text,
      voice: request.voiceId,
      speed: request.speechRate,
      gender: "male",
      lang_code: "Russian",
      instruct:
        "Сохраняй естественный голос выбранного диктора: не меняй тембр, высоту голоса, возраст и акцент. Меняй только эмоциональную подачу. Точно произноси заданный текст: не добавляй, не пропускай и не заменяй слова. Не переходи на крик или фальцет и не вставляй стоны, вздохи и другие неречевые звуки. Подача срочная и испуганная, со слегка сбившимся дыханием. Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым.",
      response_format: "pcm",
      stream: true,
      streaming_interval: config.streamingIntervalSeconds,
      max_tokens: MLX_AUDIO_TTS_MAX_TOKENS,
      verbose: false,
    });
  });

  it("does not expose internal identifiers", () => {
    const serialized = JSON.stringify(buildMlxAudioTtsRequest(request, config));

    expect(serialized).not.toContain(request.requestId);
    expect(serialized).not.toContain(request.sessionId);
  });

  it("validates the domain request before mapping", () => {
    expect(() =>
      buildMlxAudioTtsRequest({ ...request, speechRate: 3 }, config),
    ).toThrow();
  });
});
