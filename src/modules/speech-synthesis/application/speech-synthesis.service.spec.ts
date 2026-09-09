import type {
  AudioChunk,
  SpeechSynthesisStreamEvent,
  TtsSynthesisRequest,
} from "@/contracts";
import type { TtsPort } from "@/modules/ai-gateway";

import { SpeechSynthesisError } from "../domain/speech-synthesis.error";
import { SpeechSynthesisService } from "./speech-synthesis.service";
import { TtsStreamValidator } from "./tts-stream.validator";

const validRequest: TtsSynthesisRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  text: "На кухне пожар!",
  language: "Russian",
  voiceId: "caller-1",
  emotion: "panic",
  intensity: 0.8,
  speechRate: 1.1,
};

const createChunk = (
  sequence: number,
  isFinal: boolean,
  audio: AudioChunk["audio"] = new Uint8Array([sequence, sequence + 1]),
): AudioChunk => ({
  streamId: "stream-1",
  sequence,
  sampleRate: 24_000,
  channels: 1,
  format: "pcm_s16le",
  isFinal,
  audio,
});

type StreamFactory = (signal: AbortSignal) => AsyncIterable<unknown>;

class FakeTtsPort implements TtsPort {
  public readonly calls: TtsSynthesisRequest[] = [];

  constructor(private readonly streams: readonly StreamFactory[]) {}

  synthesize(
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    this.calls.push(request);
    const factory = this.streams[this.calls.length - 1];

    if (factory === undefined) {
      throw new Error("No fake TTS stream configured for this attempt");
    }

    return factory(signal) as AsyncIterable<AudioChunk>;
  }
}

async function* audioStream(
  values: readonly unknown[],
): AsyncIterable<unknown> {
  yield* values;
}

const providerFailure: StreamFactory = () => {
  throw new Error("Provider leaked sensitive details");
};

const createService = (ttsPort: TtsPort): SpeechSynthesisService =>
  new SpeechSynthesisService(ttsPort, new TtsStreamValidator());

const collect = async (
  service: SpeechSynthesisService,
  signal: AbortSignal = new AbortController().signal,
): Promise<SpeechSynthesisStreamEvent[]> => {
  const events: SpeechSynthesisStreamEvent[] = [];

  for await (const event of service.synthesize(validRequest, signal)) {
    events.push(event);
  }

  return events;
};

describe(SpeechSynthesisService.name, () => {
  it("streams PCM without copying and emits completion metrics", async () => {
    const firstAudio = new Uint8Array([0, 1, 2, 3]);
    const ttsPort = new FakeTtsPort([
      () =>
        audioStream([createChunk(0, false, firstAudio), createChunk(1, true)]),
    ]);

    const events = await collect(createService(ttsPort));

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe("audio.chunk");
    if (events[0]?.type === "audio.chunk") {
      expect(events[0].chunk.audio).toBe(firstAudio);
    }
    expect(events[2]).toEqual({
      type: "synthesis.completed",
      metrics: expect.objectContaining({
        timeToFirstAudioMs: expect.any(Number),
        durationMs: expect.any(Number),
        chunkCount: 2,
        audioBytes: 6,
        attempts: [expect.objectContaining({ attempt: 1, outcome: "success" })],
      }),
    });
    expect(ttsPort.calls).toEqual([validRequest]);
  });

  it("validates input before calling the TTS provider", () => {
    const ttsPort = new FakeTtsPort([
      () => audioStream([createChunk(0, true)]),
    ]);
    const service = createService(ttsPort);

    expect(() =>
      service.synthesize(
        { ...validRequest, text: "" },
        new AbortController().signal,
      ),
    ).toThrow();
    expect(ttsPort.calls).toHaveLength(0);
  });

  it("retries a provider failure before the first audio chunk", async () => {
    const ttsPort = new FakeTtsPort([
      providerFailure,
      () => audioStream([createChunk(0, true)]),
    ]);

    const events = await collect(createService(ttsPort));
    const completion = events.at(-1);

    expect(completion).toEqual({
      type: "synthesis.completed",
      metrics: expect.objectContaining({
        attempts: [
          expect.objectContaining({ attempt: 1, outcome: "provider-error" }),
          expect.objectContaining({ attempt: 2, outcome: "success" }),
        ],
      }),
    });
    expect(ttsPort.calls).toHaveLength(2);
  });

  it("retries an invalid stream before the first audio chunk", async () => {
    const ttsPort = new FakeTtsPort([
      () => audioStream([]),
      () => audioStream([createChunk(0, true)]),
    ]);

    const events = await collect(createService(ttsPort));
    const completion = events.at(-1);

    expect(completion).toEqual({
      type: "synthesis.completed",
      metrics: expect.objectContaining({
        attempts: [
          expect.objectContaining({ attempt: 1, outcome: "invalid-stream" }),
          expect.objectContaining({ attempt: 2, outcome: "success" }),
        ],
      }),
    });
    expect(ttsPort.calls).toHaveLength(2);
  });

  it("does not retry a provider failure after emitting audio", async () => {
    const ttsPort = new FakeTtsPort([
      async function* (): AsyncIterable<unknown> {
        yield createChunk(0, false);
        throw new Error("Provider failed mid-stream");
      },
      () => audioStream([createChunk(0, true)]),
    ]);
    const stream = createService(ttsPort).synthesize(
      validRequest,
      new AbortController().signal,
    );
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
        value: expect.objectContaining({ type: "audio.chunk" }),
      }),
    );
    await expect(iterator.next()).rejects.toEqual(
      expect.objectContaining<Partial<SpeechSynthesisError>>({
        code: "provider-error",
        attempts: [expect.objectContaining({ attempt: 1 })],
      }),
    );
    expect(ttsPort.calls).toHaveLength(1);
  });

  it("does not retry an invalid stream after emitting audio", async () => {
    const ttsPort = new FakeTtsPort([
      () => audioStream([createChunk(0, false)]),
      () => audioStream([createChunk(0, true)]),
    ]);
    const stream = createService(ttsPort).synthesize(
      validRequest,
      new AbortController().signal,
    );
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({ done: false }),
    );
    await expect(iterator.next()).rejects.toEqual(
      expect.objectContaining({ code: "invalid-stream" }),
    );
    expect(ttsPort.calls).toHaveLength(1);
  });

  it("throws a sanitized error after two early failures", async () => {
    const ttsPort = new FakeTtsPort([providerFailure, providerFailure]);

    let thrown: unknown;

    try {
      await collect(createService(ttsPort));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining({
        code: "provider-error",
        attempts: [
          expect.objectContaining({ attempt: 1, outcome: "provider-error" }),
          expect.objectContaining({ attempt: 2, outcome: "provider-error" }),
        ],
      }),
    );
    expect(String(thrown)).not.toContain("sensitive details");
    expect(ttsPort.calls).toHaveLength(2);
  });

  it("propagates cancellation without retrying", async () => {
    const controller = new AbortController();
    const reason = new Error("Synthesis cancelled");
    const ttsPort = new FakeTtsPort([
      async function* (): AsyncIterable<unknown> {
        controller.abort(reason);
        yield createChunk(0, true);
      },
      () => audioStream([createChunk(0, true)]),
    ]);

    await expect(
      collect(createService(ttsPort), controller.signal),
    ).rejects.toBe(reason);
    expect(ttsPort.calls).toHaveLength(1);
  });
});
