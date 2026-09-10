import { describe, expect, test } from "bun:test";

import {
  MAX_SCENARIO_AMBIENCE_LEVEL,
  TELEPHONE_OUTPUT_LIMIT,
  TelephoneAudioProcessor,
  resolveScenarioAmbience,
  type ScenarioAmbienceProfile,
} from "../src/services/telephone-audio-processor";

const SAMPLE_RATE = 24_000;

const createProcessor = (
  ambience: ScenarioAmbienceProfile = "none",
): TelephoneAudioProcessor =>
  new TelephoneAudioProcessor({
    sampleRate: SAMPLE_RATE,
    ambience,
    seed: "scenario-version-1",
  });

const sinePcm = (frequency: number, seconds = 1): Int16Array =>
  Int16Array.from(
    { length: SAMPLE_RATE * seconds },
    (_, index) =>
      Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) * 20_000,
  );

const rootMeanSquare = (samples: Float32Array, skip = 2_000): number => {
  let sum = 0;

  for (let index = skip; index < samples.length; index += 1) {
    sum += samples[index] ** 2;
  }

  return Math.sqrt(sum / (samples.length - skip));
};

describe(resolveScenarioAmbience.name, () => {
  test.each([
    ["fire", "emergency-outdoor"],
    ["road_accident", "emergency-outdoor"],
    ["gas_leak", "emergency-outdoor"],
    ["criminal", "street"],
    ["medical", "room"],
    ["future-category", "room"],
  ] as const)("maps %s to %s", (category, expected) => {
    expect(resolveScenarioAmbience(category)).toBe(expected);
  });
});

describe(TelephoneAudioProcessor.name, () => {
  test("favours the telephone speech band", () => {
    const low = rootMeanSquare(createProcessor().process(sinePcm(100)));
    const speech = rootMeanSquare(createProcessor().process(sinePcm(1_000)));
    const high = rootMeanSquare(createProcessor().process(sinePcm(7_000)));

    expect(speech).toBeGreaterThan(low * 2);
    expect(speech).toBeGreaterThan(high * 1.5);
  });

  test("preserves sample count and bounds full-scale input", () => {
    const input = new Int16Array(8_000).fill(0x7fff);
    const output = createProcessor("emergency-outdoor").process(input);

    expect(output).toHaveLength(input.length);
    expect(Math.max(...output)).toBeLessThanOrEqual(TELEPHONE_OUTPUT_LIMIT);
    expect(Math.min(...output)).toBeGreaterThanOrEqual(-TELEPHONE_OUTPUT_LIMIT);
  });

  test("keeps procedural emergency ambience quiet", () => {
    const output = createProcessor("emergency-outdoor").process(
      new Int16Array(SAMPLE_RATE),
    );
    const peak = Math.max(...output.map(Math.abs));

    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(MAX_SCENARIO_AMBIENCE_LEVEL);
  });

  test("repeats exactly after reset", () => {
    const processor = createProcessor("emergency-outdoor");
    const input = sinePcm(900, 0.1);
    const first = processor.process(input);

    processor.reset();

    expect(processor.process(input)).toEqual(first);
  });

  test("keeps filter and ambience state across chunk boundaries", () => {
    const input = sinePcm(1_100, 0.2);
    const whole = createProcessor("emergency-outdoor").process(input);
    const chunkedProcessor = createProcessor("emergency-outdoor");
    const splitAt = 1_337;
    const first = chunkedProcessor.process(input.slice(0, splitAt));
    const second = chunkedProcessor.process(input.slice(splitAt));
    const chunked = new Float32Array(input.length);

    chunked.set(first);
    chunked.set(second, first.length);

    expect(chunked).toEqual(whole);
  });
});
