import type { AudioChunk } from "@/contracts";

import { parseTtsPcm } from "./tts.pcm";

const createStream = (
  chunks: readonly Uint8Array[],
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });

const collect = async (
  chunks: readonly Uint8Array[],
): Promise<AudioChunk[]> => {
  const result: AudioChunk[] = [];

  for await (const chunk of parseTtsPcm(
    createStream(chunks),
    "request-1",
    new AbortController().signal,
  )) {
    result.push(chunk);
  }

  return result;
};

describe(parseTtsPcm.name, () => {
  it("maps one PCM network chunk to one final audio chunk", async () => {
    const audio = new Uint8Array([0, 1, 2, 3]);

    await expect(collect([audio])).resolves.toEqual([
      {
        streamId: "request-1",
        sequence: 0,
        sampleRate: 24_000,
        channels: 1,
        format: "pcm_s16le",
        isFinal: true,
        audio,
      },
    ]);
  });

  it("assigns sequences and marks only the last chunk as final", async () => {
    const first = new Uint8Array([0, 1]);
    const second = new Uint8Array([2, 3]);
    const third = new Uint8Array([4, 5]);
    const result = await collect([first, second, third]);

    expect(
      result.map(({ sequence, isFinal }) => ({ sequence, isFinal })),
    ).toEqual([
      { sequence: 0, isFinal: false },
      { sequence: 1, isFinal: false },
      { sequence: 2, isFinal: true },
    ]);
    expect(result.map(({ audio }) => audio)).toEqual([first, second, third]);
  });

  it("reassembles int16 samples split across network chunks", async () => {
    const result = await collect([
      new Uint8Array([0, 1, 2]),
      new Uint8Array([3, 4, 5, 6]),
      new Uint8Array([7]),
    ]);

    expect(result.map(({ audio }) => [...audio])).toEqual([
      [0, 1],
      [2, 3, 4, 5],
      [6, 7],
    ]);
  });

  it("preserves aligned PCM buffers without copying", async () => {
    const first = new Uint8Array([0, 1]);
    const second = new Uint8Array([2, 3]);
    const result = await collect([first, second]);

    expect(result[0]?.audio).toBe(first);
    expect(result[1]?.audio).toBe(second);
  });

  it("rejects an empty PCM stream", async () => {
    await expect(collect([])).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("rejects an odd final PCM payload", async () => {
    await expect(collect([new Uint8Array([0, 1, 2])])).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("preserves caller cancellation while reading", async () => {
    const controller = new AbortController();
    const reason = new Error("Synthesis cancelled");
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort(reason);
      },
    });
    const result = parseTtsPcm(stream, "request-1", controller.signal);

    await expect(result[Symbol.asyncIterator]().next()).rejects.toBe(reason);
  });
});
