import { describe, expect, it } from "bun:test";
import {
  DeferredEvent,
  PendingPcmBuffer,
  levelFromSamples,
  packPcm16,
  resampleLinear,
} from "../src/lib/audio-processing";

describe("browser audio processing", () => {
  it("resamples and packs mono PCM16 little endian", () => {
    const resampled = resampleLinear(
      new Float32Array([0, 0.5, -1, 1]),
      32_000,
      16_000,
    );
    expect(resampled.length).toBe(2);
    const view = new DataView(packPcm16(resampled));
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(-32768);
  });

  it("maps silence and full scale into the indicator range", () => {
    expect(levelFromSamples(new Float32Array(32))).toBe(0);
    expect(levelFromSamples(new Float32Array(32).fill(1))).toBe(1);
  });

  it("keeps only the last 32 chunks before listen.started", () => {
    const pending = new PendingPcmBuffer();
    for (let index = 0; index < 40; index += 1)
      pending.push(new Uint8Array([index]).buffer);
    const values = pending.drain().map((chunk) => new Uint8Array(chunk)[0]);
    expect(values).toHaveLength(32);
    expect(values[0]).toBe(8);
    expect(pending.drain()).toHaveLength(0);
  });

  it("releases audio.done only for the playback generation that drained", () => {
    const deferred = new DeferredEvent<string>();
    deferred.defer(2, "audio.done");
    expect(deferred.take(1)).toBeNull();
    expect(deferred.take(2)).toBe("audio.done");
    expect(deferred.take(2)).toBeNull();
  });
});
