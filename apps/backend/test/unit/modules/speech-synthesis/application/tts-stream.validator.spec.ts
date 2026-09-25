import type { AudioChunk } from "@/contracts";

import { TtsStreamValidationError } from "@/modules/speech-synthesis/domain/tts-stream-validation.error";
import { TtsStreamValidator } from "@/modules/speech-synthesis/application/tts-stream.validator";

const createChunk = (
  sequence: number,
  isFinal: boolean,
  overrides: Partial<AudioChunk> = {},
): AudioChunk => ({
  streamId: "stream-1",
  sequence,
  sampleRate: 24_000,
  channels: 1,
  format: "pcm_s16le",
  isFinal,
  audio: new Uint8Array([sequence, sequence + 1]),
  ...overrides,
});

async function* chunks(values: readonly unknown[]): AsyncIterable<unknown> {
  yield* values;
}

const collect = async (
  values: readonly unknown[],
  signal: AbortSignal = new AbortController().signal,
): Promise<AudioChunk[]> => {
  const result: AudioChunk[] = [];
  const validator = new TtsStreamValidator();

  for await (const chunk of validator.validate(chunks(values), signal)) {
    result.push(chunk);
  }

  return result;
};

const expectValidationError = async (
  values: readonly unknown[],
  code: TtsStreamValidationError["code"],
): Promise<void> => {
  await expect(collect(values)).rejects.toEqual(
    expect.objectContaining({ code }),
  );
};

describe(TtsStreamValidator.name, () => {
  it("streams valid chunks without copying their PCM payloads", async () => {
    const firstAudio = new Uint8Array([0, 1, 2, 3]);
    const first = createChunk(0, false, { audio: firstAudio });
    const final = createChunk(1, true);

    const result = await collect([first, final]);

    expect(result).toHaveLength(2);
    expect(result[0]?.audio).toBe(firstAudio);
  });

  it("rejects an invalid PCM chunk", async () => {
    await expectValidationError(
      [{ ...createChunk(0, true), audio: "AAEC" }],
      "invalid-chunk",
    );
  });

  it.each([
    ["non-zero first sequence", [createChunk(1, true)]],
    ["skipped sequence", [createChunk(0, false), createChunk(2, true)]],
    ["repeated sequence", [createChunk(0, false), createChunk(0, true)]],
  ])("rejects %s", async (_name, values) => {
    await expectValidationError(values, "sequence-mismatch");
  });

  it.each([
    [
      "stream ID change",
      [createChunk(0, false), createChunk(1, true, { streamId: "stream-2" })],
    ],
    [
      "sample rate change",
      [createChunk(0, false), createChunk(1, true, { sampleRate: 48_000 })],
    ],
  ])("rejects %s", async (_name, values) => {
    await expectValidationError(values, "metadata-mismatch");
  });

  it("rejects a stream without chunks", async () => {
    await expectValidationError([], "empty-stream");
  });

  it("rejects a stream without a final chunk", async () => {
    await expectValidationError([createChunk(0, false)], "missing-final");
  });

  it("rejects a repeated final chunk", async () => {
    await expectValidationError(
      [createChunk(0, true), createChunk(1, true)],
      "event-after-final",
    );
  });

  it("rejects a regular chunk after the final chunk", async () => {
    await expectValidationError(
      [createChunk(0, true), createChunk(1, false)],
      "event-after-final",
    );
  });

  it("preserves caller cancellation", async () => {
    const controller = new AbortController();
    const reason = new Error("Synthesis cancelled");
    controller.abort(reason);

    await expect(
      collect([createChunk(0, true)], controller.signal),
    ).rejects.toBe(reason);
  });
});
