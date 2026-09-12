import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerGenderSchema,
  findQwenTtsVoice,
  type AudioChunk,
  type TtsSynthesisRequest,
} from "@/contracts";
import {
  type QwenTtsEnvironment,
  parseQwenTtsConfig,
} from "@/modules/ai-gateway/adapters/qwen-tts/qwen-tts.config";
import { createQwenTtsAdapter } from "@/modules/ai-gateway/adapters/qwen-tts/qwen-tts.factory";
import { QwenTtsReferenceVoiceRegistryFileSchema } from "@/modules/ai-gateway/adapters/qwen-tts/qwen-tts.reference-voices";
import { concatPcmChunks } from "@/modules/ai-gateway/diagnostics/tts-diagnostic";
import { encodeWav } from "@/modules/call-recording/domain/wav";
import { SpeechSynthesisService } from "@/modules/speech-synthesis/application/speech-synthesis.service";
import { TtsStreamValidator } from "@/modules/speech-synthesis/application/tts-stream.validator";

const DEFAULT_REFERENCE_TEXT =
  "Проверка связи. Я говорю обычным голосом, спокойно и разборчиво.";
const QWEN_ENVIRONMENT_KEYS = [
  "QWEN_TTS_PROVIDER",
  "QWEN_TTS_MODE",
  "QWEN_TTS_BASE_URL",
  "QWEN_TTS_MODEL",
  "QWEN_TTS_REFERENCE_VOICES_PATH",
  "QWEN_TTS_STREAMING_INTERVAL_SECONDS",
  "QWEN_TTS_REQUEST_TIMEOUT_MS",
] as const satisfies readonly (keyof QwenTtsEnvironment)[];

const OptionsSchema = z
  .object({
    output: z.string().trim().min(1),
    voices: z
      .array(
        z
          .object({ id: AiIdentifierSchema, gender: CallerGenderSchema })
          .strict(),
      )
      .min(1),
    text: z.string().trim().min(3).max(2_000),
  })
  .strict();

const selectEnvironment = (): Record<string, unknown> =>
  Object.fromEntries(
    QWEN_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );

const parseOptions = (argv: readonly string[]) => {
  const values = new Map<string, string>();

  for (const argument of argv) {
    const match = /^--(output|voice|gender|text)=(.+)$/.exec(argument);

    if (!match) {
      throw new Error(`Unknown reference preparation option: ${argument}`);
    }

    values.set(match[1], match[2]);
  }

  // Несколько голосов за один запуск: реестр всё равно один, и записывать их
  // по одному значило бы каждый раз перечитывать и переписывать его целиком.
  const requested = (values.get("voice") ?? "Dylan").split(",");
  const gender = values.get("gender");
  const voices = requested.map((raw) => {
    const id = AiIdentifierSchema.parse(raw.trim());
    const voiceGender = gender ?? findQwenTtsVoice(id)?.gender;

    if (voiceGender === undefined) {
      throw new Error(
        `Cannot infer gender for voice ${id}. Pass --gender=male or --gender=female.`,
      );
    }

    return { id, gender: voiceGender };
  });

  return OptionsSchema.parse({
    output: values.get("output"),
    voices,
    text: values.get("text") ?? DEFAULT_REFERENCE_TEXT,
  });
};

/**
 * Читает реестр, который уже лежит рядом.
 *
 * Голоса добавляются к нему, а не заменяют его: в одном реестре живут все
 * дикторы каталога, и готовить их приходится по мере появления сценариев.
 */
const readRegistry = async (
  path: string,
): Promise<z.infer<typeof QwenTtsReferenceVoiceRegistryFileSchema>> => {
  try {
    return QwenTtsReferenceVoiceRegistryFileSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, defaults: {}, voices: [] };
    }

    throw error;
  }
};

const synthesizeReference = async (
  service: SpeechSynthesisService,
  request: TtsSynthesisRequest,
): Promise<Uint8Array> => {
  const chunks: AudioChunk["audio"][] = [];

  for await (const event of service.synthesize(
    request,
    AbortSignal.timeout(300_000),
  )) {
    if (event.type === "audio.chunk") {
      chunks.push(event.chunk.audio);
    }
  }

  return encodeWav(concatPcmChunks(chunks), 24_000);
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const output = resolve(options.output);
  await mkdir(output, { recursive: true });

  const config = parseQwenTtsConfig(selectEnvironment());

  if (config.mode !== "custom-voice") {
    throw new Error(
      "Prepare the synthetic reference with QWEN_TTS_MODE=custom-voice, then switch to base-icl.",
    );
  }

  const adapter = createQwenTtsAdapter(
    config,
    globalThis.fetch.bind(globalThis),
  );
  const service = new SpeechSynthesisService(adapter, new TtsStreamValidator());
  const registryPath = join(output, "reference-voices.json");
  const registry = await readRegistry(registryPath);
  const voices = new Map(registry.voices.map((voice) => [voice.id, voice]));
  const defaults = { ...registry.defaults };

  for (const voice of options.voices) {
    const id = voice.id.toLowerCase();
    const artifact = `${id}.wav`;
    const wav = await synthesizeReference(service, {
      requestId: `prepare-reference-${id}`,
      sessionId: "prepare-reference",
      text: options.text,
      language: "Russian",
      voiceId: voice.id,
      gender: voice.gender,
      emotion: "calm",
      intensity: 0.25,
      speechRate: 1,
    });

    await writeFile(join(output, artifact), wav);
    voices.set(id, {
      id,
      gender: voice.gender,
      source: "synthetic",
      audioPath: `./${artifact}`,
      refText: options.text,
      sha256: createHash("sha256").update(wav).digest("hex"),
    });
    // Первый голос своего пола становится запасным: сценарий с персоной, для
    // которой профиля нет, всё равно должен заговорить — хотя бы не чужим полом.
    defaults[voice.gender] ??= id;

    console.log(`${id} · ${(wav.byteLength / 1024).toFixed(0)} КиБ`);
  }

  const updated = QwenTtsReferenceVoiceRegistryFileSchema.parse({
    version: 1,
    defaults,
    voices: [...voices.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });

  await writeFile(registryPath, `${JSON.stringify(updated, null, 2)}\n`);

  console.log(
    `Реестр: ${registryPath} — голосов ${updated.voices.length}, по умолчанию ${JSON.stringify(updated.defaults)}`,
  );
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
