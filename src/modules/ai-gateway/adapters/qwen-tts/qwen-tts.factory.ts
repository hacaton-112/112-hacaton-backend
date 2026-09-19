import type { TtsPort } from "@/modules/ai-gateway/ports/tts.port";

import { MlxAudioTtsAdapter } from "./mlx-audio/mlx-audio-tts.adapter";
import { PiperTtsAdapter } from "./piper/piper-tts.adapter";
import type { QwenTtsConfig } from "./qwen-tts.config";
import type { QwenTtsFetch } from "./qwen-tts.tokens";
import { VllmOmniTtsAdapter } from "./vllm-omni/vllm-omni-tts.adapter";

export const createQwenTtsAdapter = (
  config: QwenTtsConfig,
  fetchImplementation: QwenTtsFetch,
): TtsPort => {
  switch (config.provider) {
    case "mlx-audio":
      return new MlxAudioTtsAdapter(config, fetchImplementation);
    case "vllm-omni":
      return new VllmOmniTtsAdapter(config, fetchImplementation);
    case "piper":
      return new PiperTtsAdapter(config, fetchImplementation);
  }
};
