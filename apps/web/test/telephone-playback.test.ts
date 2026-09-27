import { describe, expect, test } from "bun:test";

import { createTelephoneTestTone } from "../src/lib/web-audio";

describe("DDS telephone playback", () => {
  test("sound check produces audible signed PCM", () => {
    const pcm = createTelephoneTestTone(600, 24_000);
    const samples = new Int16Array(pcm);
    const peak = samples.reduce(
      (current, sample) => Math.max(current, Math.abs(sample)),
      0,
    );
    const nonSilent = samples.filter((sample) => sample !== 0).length;

    expect(samples).toHaveLength(14_400);
    expect(peak).toBeGreaterThan(8_000);
    expect(nonSilent).toBeGreaterThan(samples.length * 0.95);
  });

  test("sound check always creates at least one sample", () => {
    expect(new Int16Array(createTelephoneTestTone(0))).toHaveLength(1);
  });
});
