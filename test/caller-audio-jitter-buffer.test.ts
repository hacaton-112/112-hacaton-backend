import { describe, expect, it } from "bun:test";

import {
  CallerAudioJitterBuffer,
  type CallerAudioScheduler,
} from "../src/services/caller-audio-jitter-buffer";

interface ScheduledChunk {
  samples: number;
  sampleRate: number;
  startAt: number;
  stopped: boolean;
}

const pcm = (milliseconds: number, sampleRate = 1_000): ArrayBuffer =>
  new ArrayBuffer((milliseconds * sampleRate * 2) / 1_000);

const harness = () => {
  let now = 10;
  const chunks: ScheduledChunk[] = [];
  const scheduler: CallerAudioScheduler = {
    currentTime: () => now,
    schedule: (audio, sampleRate, startAt) => {
      const chunk: ScheduledChunk = {
        samples: audio.length,
        sampleRate,
        startAt,
        stopped: false,
      };
      chunks.push(chunk);

      return {
        stop: () => {
          chunk.stopped = true;
        },
      };
    },
  };
  const buffer = new CallerAudioJitterBuffer({ scheduler });

  return {
    buffer,
    chunks,
    setNow: (value: number) => {
      now = value;
    },
  };
};

describe("CallerAudioJitterBuffer", () => {
  it("waits for the startup target and then schedules buffered PCM contiguously", () => {
    const test = harness();
    test.buffer.begin(1_000);

    test.buffer.push(pcm(100));
    expect(test.chunks).toHaveLength(0);

    test.buffer.push(pcm(60));
    expect(test.chunks).toHaveLength(2);
    expect(test.chunks[0]).toMatchObject({ startAt: 10.02, samples: 100 });
    expect(test.chunks[1]).toMatchObject({ startAt: 10.12, samples: 60 });
  });

  it("releases a short utterance when the stream completes", () => {
    const test = harness();
    test.buffer.begin(1_000);
    test.buffer.push(pcm(80));

    test.buffer.finish();

    expect(test.chunks).toHaveLength(1);
    expect(test.chunks[0]).toMatchObject({ startAt: 10.02, samples: 80 });
  });

  it("keeps a trailing binary chunk that crosses the event channel", () => {
    const test = harness();
    test.buffer.begin(1_000);
    test.buffer.push(pcm(80));
    test.buffer.finish();

    test.buffer.push(pcm(20));

    expect(test.chunks).toHaveLength(2);
    expect(test.chunks[1]).toMatchObject({ startAt: 10.1, samples: 20 });
  });

  it("recovers after an underrun without overlapping elapsed audio", () => {
    const test = harness();
    test.buffer.begin(1_000);
    test.buffer.push(pcm(160));
    expect(test.chunks[0]?.startAt).toBe(10.02);

    test.setNow(10.5);
    test.buffer.push(pcm(100));

    expect(test.chunks[1]?.startAt).toBe(10.52);
  });

  it("stops scheduled audio and drops queued chunks on reset", () => {
    const test = harness();
    test.buffer.begin(1_000);
    test.buffer.push(pcm(160));
    test.buffer.reset();
    test.buffer.push(pcm(200));

    expect(test.chunks).toHaveLength(1);
    expect(test.chunks[0]?.stopped).toBe(true);
  });

  it("starts a new stream without retaining the previous schedule", () => {
    const test = harness();
    test.buffer.begin(1_000);
    test.buffer.push(pcm(160));
    test.setNow(20);

    test.buffer.begin(2_000);
    test.buffer.push(pcm(160, 2_000));

    expect(test.chunks[0]?.stopped).toBe(true);
    expect(test.chunks[1]).toMatchObject({
      startAt: 20.02,
      samples: 320,
      sampleRate: 2_000,
    });
  });
});
