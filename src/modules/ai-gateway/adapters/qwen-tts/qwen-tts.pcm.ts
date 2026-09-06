import { AudioChunkSchema, type AudioChunk } from "@/contracts";

import {
  QWEN_TTS_AUDIO_FORMAT,
  QWEN_TTS_CHANNELS,
  QWEN_TTS_SAMPLE_RATE,
} from "./qwen-tts.config";
import { QwenTtsError } from "./qwen-tts.error";

interface AlignedPcmChunk {
  readonly audio: Uint8Array | null;
  readonly carryByte: number | null;
}

const alignPcmChunk = (
  networkChunk: Uint8Array,
  carryByte: number | null,
): AlignedPcmChunk => {
  if (networkChunk.byteLength === 0) {
    return { audio: null, carryByte };
  }

  if (carryByte === null) {
    const alignedLength =
      networkChunk.byteLength - (networkChunk.byteLength % 2);
    const nextCarryByte =
      alignedLength === networkChunk.byteLength
        ? null
        : networkChunk[networkChunk.byteLength - 1];

    return {
      audio:
        alignedLength === 0
          ? null
          : alignedLength === networkChunk.byteLength
            ? networkChunk
            : networkChunk.subarray(0, alignedLength),
      carryByte: nextCarryByte,
    };
  }

  const combinedLength = networkChunk.byteLength + 1;
  const alignedLength = combinedLength - (combinedLength % 2);
  const audio = new Uint8Array(alignedLength);

  audio[0] = carryByte;
  audio.set(networkChunk.subarray(0, alignedLength - 1), 1);

  return {
    audio,
    carryByte:
      alignedLength === combinedLength
        ? null
        : networkChunk[networkChunk.byteLength - 1],
  };
};

const createAudioChunk = (
  streamId: string,
  sequence: number,
  audio: Uint8Array,
  isFinal: boolean,
): AudioChunk =>
  AudioChunkSchema.parse({
    streamId,
    sequence,
    sampleRate: QWEN_TTS_SAMPLE_RATE,
    channels: QWEN_TTS_CHANNELS,
    format: QWEN_TTS_AUDIO_FORMAT,
    isFinal,
    audio,
  });

export async function* parseQwenTtsPcm(
  body: ReadableStream<Uint8Array>,
  streamId: string,
  signal: AbortSignal,
): AsyncIterable<AudioChunk> {
  signal.throwIfAborted();

  const reader = body.getReader();
  const cancelReader = (): void => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };

  signal.addEventListener("abort", cancelReader, { once: true });

  let carryByte: number | null = null;
  let pendingAudio: Uint8Array | null = null;
  let sequence = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();

      if (done) {
        break;
      }

      const aligned = alignPcmChunk(value, carryByte);
      carryByte = aligned.carryByte;

      if (aligned.audio === null) {
        continue;
      }

      if (pendingAudio !== null) {
        yield createAudioChunk(streamId, sequence, pendingAudio, false);
        sequence += 1;
      }

      pendingAudio = aligned.audio;
    }

    if (carryByte !== null) {
      throw new QwenTtsError(
        "invalid-response",
        "Qwen TTS returned an incomplete PCM sample",
      );
    }

    if (pendingAudio === null) {
      throw new QwenTtsError(
        "invalid-response",
        "Qwen TTS returned an empty PCM stream",
      );
    }

    yield createAudioChunk(streamId, sequence, pendingAudio, true);
  } finally {
    signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}
