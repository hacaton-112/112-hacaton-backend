import { Injectable } from "@nestjs/common";

import {
  TtsSynthesisRequestSchema,
  type AudioChunk,
  type TtsSynthesisRequest,
} from "@/contracts";
import type { TtsPort } from "@/modules/ai-gateway/ports/tts.port";

import { QwenTtsError } from "../qwen-tts.error";
import { parseQwenTtsPcm } from "../qwen-tts.pcm";
import type { QwenTtsFetch } from "../qwen-tts.tokens";
import type { VllmOmniTtsConfig } from "./vllm-omni-tts.config";
import { buildVllmOmniTtsRequest } from "./vllm-omni-tts.request";

const VLLM_OMNI_TTS_CONTENT_TYPE = "audio/pcm";

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const isPcmResponse = (response: Response): boolean =>
  response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() === VLLM_OMNI_TTS_CONTENT_TYPE;

@Injectable()
export class VllmOmniTtsAdapter implements TtsPort {
  constructor(
    private readonly config: VllmOmniTtsConfig,
    private readonly fetchImplementation: QwenTtsFetch,
  ) {}

  async *synthesize(
    rawRequest: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    signal.throwIfAborted();

    const request = TtsSynthesisRequestSchema.parse(rawRequest);
    const providerRequest = buildVllmOmniTtsRequest(request, this.config);
    const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
    const requestSignal = AbortSignal.any([signal, timeoutSignal]);

    try {
      const response = await this.fetchImplementation(
        `${this.config.baseUrl}/v1/audio/speech`,
        {
          method: "POST",
          headers: {
            Accept: VLLM_OMNI_TTS_CONTENT_TYPE,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(providerRequest),
          signal: requestSignal,
        },
      );

      if (!response.ok) {
        throw new QwenTtsError(
          "http-error",
          `vLLM Omni TTS request failed with status ${response.status}`,
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      if (!isPcmResponse(response)) {
        throw new QwenTtsError(
          "invalid-response",
          "vLLM Omni TTS returned an unexpected content type",
        );
      }

      if (response.body === null) {
        throw new QwenTtsError(
          "invalid-response",
          "vLLM Omni TTS returned an empty response stream",
        );
      }

      yield* parseQwenTtsPcm(response.body, request.requestId, requestSignal);
    } catch (error) {
      if (signal.aborted) {
        signal.throwIfAborted();
      }

      if (timeoutSignal.aborted) {
        throw new QwenTtsError("timeout", "vLLM Omni TTS request timed out", {
          retryable: true,
        });
      }

      if (error instanceof QwenTtsError) {
        throw error;
      }

      throw new QwenTtsError(
        "transport-error",
        "vLLM Omni TTS request failed before synthesis completed",
        { retryable: true },
      );
    }
  }
}
