import { describe, expect, test } from "bun:test";

import {
  createTelephoneTestTone,
  requireSelectedOutputDevice,
  TelephonePlayer,
} from "../src/lib/web-audio";

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

  test("does not silently replace a missing headset with speakers", () => {
    expect(() =>
      requireSelectedOutputDevice("headset-id", "Учебная гарнитура", null),
    ).toThrow("Учебная гарнитура");
    expect(requireSelectedOutputDevice(null, null, null)).toBeNull();
  });

  test("reapplies the selected headset before every reply", async () => {
    const originalAudioContext = globalThis.AudioContext;
    const originalNavigator = globalThis.navigator;
    const routedDevices: string[] = [];

    class FakeAudioContext {
      state: AudioContextState = "running";
      readonly destination = {} as AudioDestinationNode;
      readonly audioWorklet = { addModule: async () => undefined };

      async resume(): Promise<void> {}
      async close(): Promise<void> {
        this.state = "closed";
      }
      async setSinkId(deviceId: string): Promise<void> {
        routedDevices.push(deviceId);
      }
    }

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          enumerateDevices: async () => [
            {
              deviceId: "headset-1",
              groupId: "group-1",
              kind: "audiooutput",
              label: "Учебная гарнитура",
              toJSON: () => ({}),
            } satisfies MediaDeviceInfo,
          ],
        },
      },
      writable: true,
    });

    const player = new TelephonePlayer();
    try {
      await player.prepare("headset-1", "Учебная гарнитура");
      await player.prepare("headset-1", "Учебная гарнитура");
      expect(routedDevices).toEqual(["headset-1", "headset-1"]);
    } finally {
      await player.cancel();
      Object.defineProperty(globalThis, "AudioContext", {
        configurable: true,
        value: originalAudioContext,
        writable: true,
      });
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
        writable: true,
      });
    }
  });
});
