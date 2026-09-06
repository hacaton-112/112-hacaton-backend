import { MlxAudioTtsAdapter } from "./mlx-audio/mlx-audio-tts.adapter";
import { createQwenTtsAdapter } from "./qwen-tts.factory";
import { VllmOmniTtsAdapter } from "./vllm-omni/vllm-omni-tts.adapter";

const fetchImplementation = jest.fn() as jest.MockedFunction<typeof fetch>;

describe(createQwenTtsAdapter.name, () => {
  it("selects MLX Audio", () => {
    expect(
      createQwenTtsAdapter(
        {
          provider: "mlx-audio",
          baseUrl: "http://127.0.0.1:8000",
          model: "mlx-community/Qwen3-TTS",
          streamingIntervalSeconds: 0.32,
          requestTimeoutMs: 60_000,
        },
        fetchImplementation,
      ),
    ).toBeInstanceOf(MlxAudioTtsAdapter);
  });

  it("selects vLLM Omni", () => {
    expect(
      createQwenTtsAdapter(
        {
          provider: "vllm-omni",
          baseUrl: "http://127.0.0.1:8091",
          model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
          requestTimeoutMs: 60_000,
        },
        fetchImplementation,
      ),
    ).toBeInstanceOf(VllmOmniTtsAdapter);
  });
});
