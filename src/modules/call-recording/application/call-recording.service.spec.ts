import type { RecordingStorage } from "../ports/recording-storage.port";

import {
  CallRecordingService,
  NoopCallRecordingService,
} from "./call-recording.service";

interface StoredObject {
  key: string;
  body: Uint8Array;
  contentType: string;
}

const createStorage = (
  put: jest.Mock = jest.fn().mockResolvedValue(undefined),
): { storage: RecordingStorage; stored: StoredObject[]; put: jest.Mock } => {
  const stored: StoredObject[] = [];
  const wrapped = jest.fn(
    async (key: string, body: Uint8Array, contentType: string) => {
      stored.push({ key, body, contentType });

      return put(key, body, contentType) as Promise<void>;
    },
  );

  return {
    storage: { put: wrapped } as unknown as RecordingStorage,
    stored,
    put: wrapped,
  };
};

const manifestOf = (stored: StoredObject[]): Record<string, unknown> =>
  JSON.parse(
    new TextDecoder().decode(
      stored.find((object) => object.key.endsWith("manifest.json"))?.body,
    ),
  ) as Record<string, unknown>;

/** Записи уходят в хранилище после звонка: тест ждёт этот хвост. */
const settled = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe(CallRecordingService.name, () => {
  it("stores both sides of the call as playable audio", async () => {
    const { storage, stored } = createStorage();
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");

    const operator = recorder.openSegment({
      sessionId: "session-1",
      track: "operator",
      sampleRate: 16_000,
    });
    operator.write(new Uint8Array([1, 2, 3, 4]));
    operator.close();

    const caller = recorder.openSegment({
      sessionId: "session-1",
      track: "caller",
      sampleRate: 24_000,
    });
    caller.write(new Uint8Array([5, 6]));
    caller.close();

    recorder.finishCall("session-1");
    await settled();

    expect(stored.map((object) => object.key)).toEqual([
      "calls/session-1/0001-operator.wav",
      "calls/session-1/0002-caller.wav",
      "calls/session-1/manifest.json",
    ]);
    expect(stored[0]?.contentType).toBe("audio/wav");
    // 44 байта заголовка WAV плюс сами отсчёты.
    expect(stored[0]?.body.byteLength).toBe(48);
  });

  it("writes down where in the call each utterance belongs", async () => {
    const { storage, stored } = createStorage();
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");

    const operator = recorder.openSegment({
      sessionId: "session-1",
      track: "operator",
      sampleRate: 16_000,
    });
    operator.write(new Uint8Array(32_000));
    operator.close();

    recorder.finishCall("session-1");
    await settled();

    expect(manifestOf(stored)).toMatchObject({
      sessionId: "session-1",
      segments: [
        {
          key: "calls/session-1/0001-operator.wav",
          track: "operator",
          startMs: expect.any(Number),
          durationMs: 1_000,
          sampleRate: 16_000,
        },
      ],
    });
  });

  it("keeps the manifest honest about what was stored", async () => {
    const { storage, stored } = createStorage(
      jest
        .fn()
        .mockRejectedValueOnce(new Error("storage is down"))
        .mockResolvedValue(undefined),
    );
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");

    for (const track of ["operator", "caller"] as const) {
      const segment = recorder.openSegment({
        sessionId: "session-1",
        track,
        sampleRate: 16_000,
      });
      segment.write(new Uint8Array([1, 2]));
      segment.close();
    }

    recorder.finishCall("session-1");
    await settled();

    expect(manifestOf(stored)).toMatchObject({
      segments: [{ key: "calls/session-1/0002-caller.wav" }],
    });
  });

  it("survives a storage that is not there at all", async () => {
    const { storage } = createStorage(
      jest.fn().mockRejectedValue(new Error("storage is down")),
    );
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");

    const segment = recorder.openSegment({
      sessionId: "session-1",
      track: "operator",
      sampleRate: 16_000,
    });

    expect(() => {
      segment.write(new Uint8Array([1, 2]));
      segment.close();
      recorder.finishCall("session-1");
    }).not.toThrow();

    await settled();
  });

  it("stores nothing for an utterance nobody made", async () => {
    const { storage, put } = createStorage();
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");
    recorder
      .openSegment({
        sessionId: "session-1",
        track: "operator",
        sampleRate: 16_000,
      })
      .close();
    recorder.finishCall("session-1");
    await settled();

    expect(put).not.toHaveBeenCalled();
  });

  it("caps an utterance the client never closed", async () => {
    const { storage, stored } = createStorage();
    const recorder = new CallRecordingService(storage);

    recorder.startCall("session-1");

    const segment = recorder.openSegment({
      sessionId: "session-1",
      track: "operator",
      sampleRate: 16_000,
    });

    for (let frame = 0; frame < 12; frame += 1) {
      segment.write(new Uint8Array(1_024 * 1_024));
    }

    segment.close();
    recorder.finishCall("session-1");
    await settled();

    expect(stored[0]?.body.byteLength).toBe(44 + 8 * 1_024 * 1_024);
  });

  it("ignores audio from a call it was never told about", () => {
    const { storage, put } = createStorage();
    const recorder = new CallRecordingService(storage);

    const segment = recorder.openSegment({
      sessionId: "unknown",
      track: "operator",
      sampleRate: 16_000,
    });
    segment.write(new Uint8Array([1, 2]));
    segment.close();
    recorder.finishCall("unknown");

    expect(put).not.toHaveBeenCalled();
  });
});

describe(NoopCallRecordingService.name, () => {
  it("does nothing at all when recording is switched off", () => {
    const recorder = new NoopCallRecordingService();

    expect(() => {
      recorder.startCall("session-1");
      const segment = recorder.openSegment({
        sessionId: "session-1",
        track: "operator",
        sampleRate: 16_000,
      });
      segment.write(new Uint8Array([1, 2]));
      segment.close();
      recorder.finishCall("session-1");
    }).not.toThrow();
  });
});
