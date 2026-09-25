import { Injectable } from "@nestjs/common";

import {
  AudioChunkSchema,
  type AudioChunk,
  type AudioChunkMetadata,
} from "@/contracts";

import { TtsStreamValidationError } from "../domain/tts-stream-validation.error";

type StableAudioMetadata = Pick<
  AudioChunkMetadata,
  "streamId" | "sampleRate" | "channels" | "format"
>;

const selectStableMetadata = (chunk: AudioChunk): StableAudioMetadata => ({
  streamId: chunk.streamId,
  sampleRate: chunk.sampleRate,
  channels: chunk.channels,
  format: chunk.format,
});

const hasMatchingMetadata = (
  expected: StableAudioMetadata,
  chunk: AudioChunk,
): boolean =>
  expected.streamId === chunk.streamId &&
  expected.sampleRate === chunk.sampleRate &&
  expected.channels === chunk.channels &&
  expected.format === chunk.format;

@Injectable()
export class TtsStreamValidator {
  async *validate(
    stream: AsyncIterable<unknown>,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    let expectedSequence = 0;
    let stableMetadata: StableAudioMetadata | null = null;
    let receivedChunk = false;
    let receivedFinal = false;

    signal.throwIfAborted();

    for await (const rawChunk of stream) {
      signal.throwIfAborted();

      if (receivedFinal) {
        throw new TtsStreamValidationError(
          "event-after-final",
          "The TTS stream emitted a chunk after its final chunk",
        );
      }

      const parsedChunk = AudioChunkSchema.safeParse(rawChunk);

      if (!parsedChunk.success) {
        throw new TtsStreamValidationError(
          "invalid-chunk",
          "The TTS stream emitted an invalid PCM chunk",
        );
      }

      const chunk = parsedChunk.data;

      if (chunk.sequence !== expectedSequence) {
        throw new TtsStreamValidationError(
          "sequence-mismatch",
          "The TTS stream emitted a chunk with an unexpected sequence",
        );
      }

      if (stableMetadata === null) {
        stableMetadata = selectStableMetadata(chunk);
      } else if (!hasMatchingMetadata(stableMetadata, chunk)) {
        throw new TtsStreamValidationError(
          "metadata-mismatch",
          "The TTS stream changed its PCM metadata",
        );
      }

      receivedChunk = true;
      receivedFinal = chunk.isFinal;
      expectedSequence += 1;

      yield chunk;
    }

    signal.throwIfAborted();

    if (!receivedChunk) {
      throw new TtsStreamValidationError(
        "empty-stream",
        "The TTS stream ended without audio chunks",
      );
    }

    if (!receivedFinal) {
      throw new TtsStreamValidationError(
        "missing-final",
        "The TTS stream ended without a final chunk",
      );
    }
  }
}
