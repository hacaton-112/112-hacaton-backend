import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  loadQwenTtsReferenceVoiceRegistry,
  resolveQwenTtsReferenceVoice,
  type QwenTtsReferenceVoiceFileReader,
} from "./qwen-tts.reference-voices";

const REGISTRY_PATH = resolve("/config/reference-voices.json");
const AUDIO_PATH = resolve("/config/dylan.wav");

const wave = (): Uint8Array => {
  const audio = new Uint8Array(44);

  audio.set(Buffer.from("RIFF"), 0);
  audio.set(Buffer.from("WAVE"), 8);
  return audio;
};

const registryJson = (
  audio: Uint8Array,
  overrides: Record<string, unknown> = {},
): Uint8Array =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      defaults: { male: "Dylan" },
      voices: [
        {
          id: "Dylan",
          gender: "male",
          source: "synthetic",
          audioPath: "./dylan.wav",
          refText: "Проверка связи. Я говорю спокойно и разборчиво.",
          sha256: createHash("sha256").update(audio).digest("hex"),
        },
      ],
      ...overrides,
    }),
  );

const reader = (
  registry: Uint8Array,
  audio: Uint8Array,
): QwenTtsReferenceVoiceFileReader => ({
  read: (path) => {
    if (path === REGISTRY_PATH) {
      return registry;
    }

    if (path === AUDIO_PATH) {
      return audio;
    }

    throw new Error(`Unexpected path: ${path}`);
  },
});

describe(loadQwenTtsReferenceVoiceRegistry.name, () => {
  it("loads a synthetic WAV once and verifies its immutable hash", () => {
    const audio = wave();
    const loaded = loadQwenTtsReferenceVoiceRegistry(
      REGISTRY_PATH,
      reader(registryJson(audio), audio),
    );

    expect(loaded.defaults).toEqual({ male: "dylan" });
    expect(loaded.voices.dylan).toMatchObject({
      id: "dylan",
      gender: "male",
      source: "synthetic",
      audioPath: AUDIO_PATH,
      refText: "Проверка связи. Я говорю спокойно и разборчиво.",
    });
    expect(loaded.voices.dylan?.audioDataUrl).toBe(
      `data:audio/wav;base64,${Buffer.from(audio).toString("base64")}`,
    );
  });

  it("rejects a changed reference or a non-WAV file", () => {
    const audio = wave();
    const changed = audio.slice();

    changed[20] = 1;
    expect(() =>
      loadQwenTtsReferenceVoiceRegistry(
        REGISTRY_PATH,
        reader(registryJson(audio), changed),
      ),
    ).toThrow("does not match its SHA-256");

    const invalid = new Uint8Array(44);
    expect(() =>
      loadQwenTtsReferenceVoiceRegistry(
        REGISTRY_PATH,
        reader(registryJson(invalid), invalid),
      ),
    ).toThrow("is not a WAV file");
  });

  it("rejects a default voice with a different gender", () => {
    const audio = wave();

    expect(() =>
      loadQwenTtsReferenceVoiceRegistry(
        REGISTRY_PATH,
        reader(
          registryJson(audio, { defaults: { female: "Dylan" } }),
          audio,
        ),
      ),
    ).toThrow("default female reference voice");
  });
});

describe(resolveQwenTtsReferenceVoice.name, () => {
  const audio = wave();
  const registry = loadQwenTtsReferenceVoiceRegistry(
    REGISTRY_PATH,
    reader(registryJson(audio), audio),
  );

  it("selects an exact profile without case sensitivity", () => {
    expect(resolveQwenTtsReferenceVoice(registry, "Dylan", "male").id).toBe(
      "dylan",
    );
  });

  it("falls back only to a default of the same gender", () => {
    expect(resolveQwenTtsReferenceVoice(registry, "Eric", "male").id).toBe(
      "dylan",
    );
    expect(() =>
      resolveQwenTtsReferenceVoice(registry, "Vivian", "female"),
    ).toThrow("No female Qwen TTS Base ICL reference");
  });
});
