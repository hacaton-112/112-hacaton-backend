import { API_CONFIG } from "../config/api";
import { VoiceRuntimeSchema } from "../contracts/voice-runtime";
import { api } from "../lib/api";

export async function getVoiceRuntime(signal: AbortSignal) {
  return VoiceRuntimeSchema.parse(
    await api.get<unknown>(API_CONFIG.getVoiceRuntimeUrl(), { signal }),
  );
}
