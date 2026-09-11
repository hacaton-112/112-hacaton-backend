import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { z } from "zod";

import { AiIdentifierSchema, CallerGenderSchema } from "@/contracts";

const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_REGISTRY_BYTES = 256 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const ReferenceVoiceFileSchema = z
  .object({
    id: AiIdentifierSchema,
    gender: CallerGenderSchema,
    // В проект не должны незаметно попадать записи реальных заявителей.
    source: z.literal("synthetic"),
    audioPath: z.string().trim().min(1).max(1_024),
    refText: z.string().trim().min(3).max(2_000),
    sha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export const QwenTtsReferenceVoiceRegistryFileSchema = z
  .object({
    version: z.literal(1),
    defaults: z
      .object({
        male: AiIdentifierSchema.optional(),
        female: AiIdentifierSchema.optional(),
      })
      .strict()
      .default({}),
    voices: z.array(ReferenceVoiceFileSchema).min(1).max(64),
  })
  .strict()
  .superRefine((registry, refinement) => {
    const normalizedIds = registry.voices.map(({ id }) => id.toLowerCase());

    if (new Set(normalizedIds).size !== normalizedIds.length) {
      refinement.addIssue({
        code: "custom",
        path: ["voices"],
        message: "Reference voice IDs must be unique ignoring case",
      });
    }
  });

export const QwenTtsReferenceVoiceSchema = ReferenceVoiceFileSchema.omit({
  audioPath: true,
}).extend({
  audioPath: z.string().min(1),
  audioDataUrl: z
    .string()
    .startsWith("data:audio/wav;base64,")
    .max(Math.ceil((MAX_REFERENCE_AUDIO_BYTES * 4) / 3) + 64),
});

export const QwenTtsReferenceVoiceRegistrySchema = z
  .object({
    defaults: z
      .object({
        male: AiIdentifierSchema.optional(),
        female: AiIdentifierSchema.optional(),
      })
      .strict(),
    voices: z.record(AiIdentifierSchema, QwenTtsReferenceVoiceSchema),
  })
  .strict();

export type QwenTtsReferenceVoice = z.infer<
  typeof QwenTtsReferenceVoiceSchema
>;
export type QwenTtsReferenceVoiceRegistry = z.infer<
  typeof QwenTtsReferenceVoiceRegistrySchema
>;

export interface QwenTtsReferenceVoiceFileReader {
  read(path: string): Uint8Array;
}

const nodeFileReader: QwenTtsReferenceVoiceFileReader = {
  read: (path) => readFileSync(path),
};

const isWaveFile = (audio: Uint8Array): boolean =>
  audio.byteLength >= 44 &&
  Buffer.from(audio.subarray(0, 4)).toString("ascii") === "RIFF" &&
  Buffer.from(audio.subarray(8, 12)).toString("ascii") === "WAVE";

const readBounded = (
  path: string,
  limit: number,
  reader: QwenTtsReferenceVoiceFileReader,
): Uint8Array => {
  const contents = reader.read(path);

  if (contents.byteLength > limit) {
    throw new Error(`Qwen TTS reference file is too large: ${path}`);
  }

  return contents;
};

/** Загружает и фиксирует синтетические ICL-референсы при старте backend. */
export const loadQwenTtsReferenceVoiceRegistry = (
  rawRegistryPath: string,
  reader: QwenTtsReferenceVoiceFileReader = nodeFileReader,
): QwenTtsReferenceVoiceRegistry => {
  const registryPath = isAbsolute(rawRegistryPath)
    ? rawRegistryPath
    : resolve(process.cwd(), rawRegistryPath);
  const registryBytes = readBounded(
    registryPath,
    MAX_REFERENCE_REGISTRY_BYTES,
    reader,
  );
  let rawRegistry: unknown;

  try {
    rawRegistry = JSON.parse(Buffer.from(registryBytes).toString("utf8"));
  } catch {
    throw new Error("Qwen TTS reference voice registry is not valid JSON");
  }

  const registry = QwenTtsReferenceVoiceRegistryFileSchema.parse(rawRegistry);
  const voices = Object.fromEntries(
    registry.voices.map((entry) => {
      const audioPath = isAbsolute(entry.audioPath)
        ? entry.audioPath
        : resolve(dirname(registryPath), entry.audioPath);
      const audio = readBounded(
        audioPath,
        MAX_REFERENCE_AUDIO_BYTES,
        reader,
      );

      if (!isWaveFile(audio)) {
        throw new Error(
          `Qwen TTS reference voice ${entry.id} is not a WAV file`,
        );
      }

      const actualSha256 = createHash("sha256").update(audio).digest("hex");

      if (actualSha256 !== entry.sha256) {
        throw new Error(
          `Qwen TTS reference voice ${entry.id} does not match its SHA-256`,
        );
      }

      const normalizedId = entry.id.toLowerCase();

      return [
        normalizedId,
        {
          ...entry,
          id: normalizedId,
          audioPath,
          audioDataUrl: `data:audio/wav;base64,${Buffer.from(audio).toString("base64")}`,
        },
      ];
    }),
  );
  const loaded = QwenTtsReferenceVoiceRegistrySchema.parse({
    defaults: Object.fromEntries(
      Object.entries(registry.defaults).map(([gender, id]) => [
        gender,
        id.toLowerCase(),
      ]),
    ),
    voices,
  });

  for (const [gender, id] of Object.entries(loaded.defaults)) {
    const voice = loaded.voices[id];

    if (voice === undefined || voice.gender !== gender) {
      throw new Error(
        `Qwen TTS default ${gender} reference voice is missing or has another gender`,
      );
    }
  }

  return loaded;
};

/** Сценарий выбирает профиль по voiceId; default того же пола — безопасный fallback. */
export const resolveQwenTtsReferenceVoice = (
  registry: QwenTtsReferenceVoiceRegistry,
  voiceId: string,
  gender: "male" | "female",
): QwenTtsReferenceVoice => {
  const exact = registry.voices[AiIdentifierSchema.parse(voiceId).toLowerCase()];

  if (exact !== undefined && exact.gender === gender) {
    return exact;
  }

  const defaultId = registry.defaults[gender];
  const fallback =
    defaultId === undefined ? undefined : registry.voices[defaultId];

  if (fallback === undefined || fallback.gender !== gender) {
    throw new Error(
      `No ${gender} Qwen TTS Base ICL reference is configured for voice ${voiceId}`,
    );
  }

  return fallback;
};
