import { encodeWav } from "@/modules/call-recording/domain/wav";
import {
  mixCallRecording,
  readPcm,
  resample,
  toPcmBytes,
} from "@/modules/call-recording/domain/mixdown";

const tone = (samples: number, value: number): Uint8Array<ArrayBuffer> => {
  const track = new Int16Array(samples).fill(value);

  return toPcmBytes(track);
};

const part = (
  samples: number,
  value: number,
  startMs: number,
  sampleRate: number,
) => ({
  audio: encodeWav(tone(samples, value), sampleRate),
  startMs,
  sampleRate,
});

describe("readPcm", () => {
  it("reads the samples back out of a WAV", () => {
    const wav = encodeWav(tone(4, 1_000), 24_000);

    expect([...readPcm(wav)]).toEqual([1_000, 1_000, 1_000, 1_000]);
  });

  it("skips a chunk another tool inserted before the audio", () => {
    const wav = encodeWav(tone(2, 7), 24_000);
    const extra = new Uint8Array(wav.byteLength + 12);

    extra.set(wav.subarray(0, 36), 0);
    // LIST chunk of four bytes between "fmt " and "data".
    extra.set(new TextEncoder().encode("LIST"), 36);
    new DataView(extra.buffer).setUint32(40, 4, true);
    extra.set(wav.subarray(36), 48);

    expect([...readPcm(extra)]).toEqual([7, 7]);
  });

  it("refuses something that is not a WAV", () => {
    expect(() => readPcm(new Uint8Array(64))).toThrow(/not a WAV/);
  });
});

describe("resample", () => {
  it("stretches the operator's 16 kHz to the common rate", () => {
    const samples = new Int16Array([0, 100, 200, 300]);

    expect(resample(samples, 16_000, 24_000)).toHaveLength(6);
  });

  it("returns the same samples when the rate already matches", () => {
    const samples = new Int16Array([1, 2, 3]);

    expect(resample(samples, 24_000, 24_000)).toBe(samples);
  });
});

describe("mixCallRecording", () => {
  it("puts every utterance at its own offset and leaves silence between", () => {
    // 24 отсчёта — миллисекунда при 24 кГц.
    const mixed = mixCallRecording(
      [part(24, 1_000, 0, 24_000), part(24, 2_000, 2, 24_000)],
      24_000,
    );

    expect(mixed).toHaveLength(72);
    expect(mixed[0]).toBe(1_000);
    expect(mixed[30]).toBe(0);
    expect(mixed[50]).toBe(2_000);
  });

  it("brings the operator's track to the common rate", () => {
    // Полсекунды при 16 кГц обязаны занять полсекунды и на общей дорожке.
    const mixed = mixCallRecording([part(8_000, 500, 0, 16_000)], 24_000);

    expect(mixed).toHaveLength(12_000);
  });

  it("does not overflow where both speak at once", () => {
    const mixed = mixCallRecording(
      [part(4, 30_000, 0, 24_000), part(4, 30_000, 0, 24_000)],
      24_000,
    );

    expect([...mixed]).toEqual([32_767, 32_767, 32_767, 32_767]);
  });

  it("returns nothing for a call without recorded speech", () => {
    expect(mixCallRecording([], 24_000)).toHaveLength(0);
  });
});
