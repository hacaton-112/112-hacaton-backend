import { Injectable } from "@nestjs/common";

import {
  AudioChunkSchema,
  TtsSynthesisRequestSchema,
  type AudioChunk,
  type TtsSynthesisRequest,
} from "@/contracts";
import type { TtsPort } from "@/modules/ai-gateway/ports/tts.port";

import { QwenTtsError } from "../qwen-tts.error";
import type { QwenTtsFetch } from "../qwen-tts.tokens";
import type { PiperTtsConfig } from "./piper-tts.config";

interface PcmWav {
  readonly audio: Uint8Array;
  readonly sampleRate: number;
}

const PIPER_OUTPUT_SAMPLE_RATE = 24_000;

const readTag = (view: DataView, offset: number): string =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

export const parsePcmWav = (buffer: ArrayBuffer): PcmWav => {
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 44 ||
    readTag(view, 0) !== "RIFF" ||
    readTag(view, 8) !== "WAVE"
  ) {
    throw new QwenTtsError(
      "invalid-response",
      "Piper returned an invalid WAV file",
    );
  }

  let offset = 12;
  let sampleRate: number | undefined;
  let data: Uint8Array | undefined;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readTag(view, offset);
    const chunkLength = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    const payloadEnd = payloadOffset + chunkLength;
    if (payloadEnd > buffer.byteLength) {
      break;
    }

    if (chunkId === "fmt " && chunkLength >= 16) {
      const format = view.getUint16(payloadOffset, true);
      const channels = view.getUint16(payloadOffset + 2, true);
      const rate = view.getUint32(payloadOffset + 4, true);
      const bitsPerSample = view.getUint16(payloadOffset + 14, true);
      if (format !== 1 || channels !== 1 || bitsPerSample !== 16) {
        throw new QwenTtsError(
          "invalid-response",
          "Piper returned unsupported WAV audio",
        );
      }
      sampleRate = rate;
    } else if (chunkId === "data") {
      data = new Uint8Array(buffer.slice(payloadOffset, payloadEnd));
    }

    offset = payloadEnd + (chunkLength % 2);
  }

  if (sampleRate === undefined || data === undefined || data.byteLength === 0) {
    throw new QwenTtsError(
      "invalid-response",
      "Piper returned an empty WAV file",
    );
  }

  return { audio: data, sampleRate };
};

export const resamplePcm16Mono = (
  audio: Uint8Array,
  fromSampleRate: number,
  toSampleRate: number,
): Uint8Array => {
  if (fromSampleRate === toSampleRate) return audio;

  const sourceView = new DataView(
    audio.buffer,
    audio.byteOffset,
    audio.byteLength,
  );
  const sourceLength = audio.byteLength / 2;
  const outputLength = Math.max(
    1,
    Math.round((sourceLength * toSampleRate) / fromSampleRate),
  );
  const output = new Uint8Array(outputLength * 2);
  const outputView = new DataView(output.buffer);
  const ratio = fromSampleRate / toSampleRate;

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), sourceLength - 1);
    const right = Math.min(left + 1, sourceLength - 1);
    const weight = position - left;
    const value = Math.round(
      sourceView.getInt16(left * 2, true) * (1 - weight) +
        sourceView.getInt16(right * 2, true) * weight,
    );
    outputView.setInt16(index * 2, value, true);
  }

  return output;
};

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

@Injectable()
export class PiperTtsAdapter implements TtsPort {
  constructor(
    private readonly config: PiperTtsConfig,
    private readonly fetchImplementation: QwenTtsFetch,
  ) {}

  async *synthesize(
    rawRequest: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    signal.throwIfAborted();
    const request = TtsSynthesisRequestSchema.parse(rawRequest);
    const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
    const requestSignal = AbortSignal.any([signal, timeoutSignal]);

    try {
      const response = await this.fetchImplementation(
        `${this.config.baseUrl}/synthesize`,
        {
          method: "POST",
          headers: { Accept: "audio/wav", "Content-Type": "application/json" },
          body: JSON.stringify({
            text: request.text,
            voice:
              request.gender === "male"
                ? this.config.maleVoice
                : this.config.femaleVoice,
            length_scale: 1 / request.speechRate,
          }),
          signal: requestSignal,
        },
      );

      if (!response.ok) {
        throw new QwenTtsError(
          "http-error",
          `Piper TTS request failed with status ${response.status}`,
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      const wav = parsePcmWav(await response.arrayBuffer());
      const audio = resamplePcm16Mono(
        wav.audio,
        wav.sampleRate,
        PIPER_OUTPUT_SAMPLE_RATE,
      );
      yield AudioChunkSchema.parse({
        streamId: request.requestId,
        sequence: 0,
        sampleRate: PIPER_OUTPUT_SAMPLE_RATE,
        channels: 1,
        format: "pcm_s16le",
        isFinal: true,
        audio,
      });
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      if (timeoutSignal.aborted) {
        throw new QwenTtsError("timeout", "Piper TTS request timed out", {
          retryable: true,
        });
      }
      if (error instanceof QwenTtsError) throw error;
      throw new QwenTtsError(
        "transport-error",
        "Piper TTS request failed before synthesis completed",
        { retryable: true },
      );
    }
  }
}
