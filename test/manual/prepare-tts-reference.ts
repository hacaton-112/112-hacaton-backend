import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
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

const REFERENCE_TEXT =
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
    voiceId: AiIdentifierSchema,
    gender: CallerGenderSchema,
  })
  .strict();

const selectEnvironment = (): Record<string, unknown> =>
  Object.fromEntries(
    QWEN_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );

const parseOptions = (argv: readonly string[]) => {
  const values = new Map<string, string>();

  for (const argument of argv) {
    const match = /^--(output|voice|gender)=(.+)$/.exec(argument);

    if (!match) {
      throw new Error(`Unknown reference preparation option: ${argument}`);
    }

    values.set(match[1], match[2]);
  }

  const voiceId = AiIdentifierSchema.parse(values.get("voice") ?? "Dylan");
  const gender = values.get("gender") ?? findQwenTtsVoice(voiceId)?.gender;

  if (gender === undefined) {
    throw new Error(
      `Cannot infer gender for voice ${voiceId}. Pass --gender=male or --gender=female.`,
    );
  }

  return OptionsSchema.parse({
    output: values.get("output"),
    voiceId,
    gender,
  });
};

const ensureEmptyOutputDirectory = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });

  if ((await readdir(path)).length > 0) {
    throw new Error(`Reference output directory is not empty: ${path}`);
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
  await ensureEmptyOutputDirectory(output);

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
  const id = options.voiceId.toLowerCase();
  const artifact = `${id}.wav`;
  const wav = await synthesizeReference(service, {
    requestId: `prepare-reference-${id}`,
    sessionId: "prepare-reference",
    text: REFERENCE_TEXT,
    language: "Russian",
    voiceId: options.voiceId,
    gender: options.gender,
    emotion: "calm",
    intensity: 0.25,
    speechRate: 1,
  });
  const sha256 = createHash("sha256").update(wav).digest("hex");
  const registry = QwenTtsReferenceVoiceRegistryFileSchema.parse({
    version: 1,
    defaults: { [options.gender]: id },
    voices: [
      {
        id,
        gender: options.gender,
        source: "synthetic",
        audioPath: `./${artifact}`,
        refText: REFERENCE_TEXT,
        sha256,
      },
    ],
  });

  await writeFile(join(output, artifact), wav, { flag: "wx" });
  await writeFile(
    join(output, "reference-voices.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
    { flag: "wx" },
  );

  console.log(`Synthetic reference: ${join(output, artifact)}`);
  console.log(`Reference registry: ${join(output, "reference-voices.json")}`);
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
