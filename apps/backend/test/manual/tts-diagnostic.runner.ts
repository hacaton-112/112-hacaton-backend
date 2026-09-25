import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import WebSocket from "ws";
import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerGenderSchema,
  findCallerVoice,
  type AudioChunk,
  type SpeechSynthesisMetrics,
  type TtsSynthesisRequest,
} from "@/contracts";
import {
  type TtsEnvironment,
  parseTtsConfig,
} from "@/modules/ai-gateway/infrastructure/tts/tts.config";
import { PiperTtsAdapter } from "@/modules/ai-gateway/infrastructure/tts/piper/piper-tts.adapter";
import {
  characterErrorRate,
  concatPcmChunks,
  createTtsDiagnosticArtifact,
  createTtsDiagnosticManifest,
  resamplePcm16Mono,
  TTS_DIAGNOSTIC_CASES,
  type TtsDiagnosticAsrResult,
  type TtsDiagnosticEntry,
} from "@/modules/ai-gateway/domain/tts-diagnostic";
import { SpeechSynthesisService } from "@/modules/speech-synthesis/application/speech-synthesis.service";
import { TtsStreamValidator } from "@/modules/speech-synthesis/application/tts-stream.validator";

const DIAGNOSTIC_TIMEOUT_MS = 300_000;
const ASR_TIMEOUT_MS = 60_000;
const DEFAULT_ASR_SERVICE_URL = "http://127.0.0.1:8787";
const ASR_FRAME_MS = 100;

const TTS_ENVIRONMENT_KEYS = [
  "TTS_REQUEST_TIMEOUT_MS",
  "PIPER_TTS_BASE_URL",
  "PIPER_TTS_MALE_VOICE",
  "PIPER_TTS_FEMALE_VOICE",
] as const satisfies readonly (keyof TtsEnvironment)[];

const TtsDiagnosticOptionsSchema = z
  .object({
    output: z.string().trim().min(1),
    repetitions: z.coerce.number().int().min(1).max(20).default(3),
    voiceId: AiIdentifierSchema,
    gender: CallerGenderSchema,
    asrRoundTrip: z.boolean().default(false),
  })
  .strict();

type TtsDiagnosticOptions = z.infer<typeof TtsDiagnosticOptionsSchema>;

const AsrSessionSchema = z
  .object({
    sessionId: z.string().min(1),
    sampleRate: z.number().int().positive(),
  })
  .loose();

const AsrEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }).loose(),
  z
    .object({
      type: z.literal("partial"),
      transcript: z.string(),
    })
    .loose(),
  z
    .object({
      type: z.literal("final"),
      transcript: z.string(),
      audioMs: z.number().nonnegative(),
      processingMs: z.number().nonnegative(),
      reason: z.enum(["silence", "stop"]).optional().catch(undefined),
    })
    .loose(),
  z.object({ type: z.literal("error"), message: z.string() }).loose(),
  z.object({ type: z.literal("pong") }).loose(),
]);

const selectEnvironment = (keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map((key) => [key, process.env[key]]));

const parseOptions = (argv: readonly string[]): TtsDiagnosticOptions => {
  const values = new Map<string, string>();
  let asrRoundTrip = false;

  for (const argument of argv) {
    if (argument === "--asr") {
      asrRoundTrip = true;
      continue;
    }

    const match = /^--(output|repetitions|voice|gender)=(.+)$/.exec(argument);
    if (!match) {
      throw new Error(`Unknown diagnostic option: ${argument}`);
    }

    values.set(match[1], match[2]);
  }

  const voiceId = AiIdentifierSchema.parse(values.get("voice") ?? "Dylan");
  const gender = values.get("gender") ?? findCallerVoice(voiceId)?.gender;

  if (gender === undefined) {
    throw new Error(
      `Cannot infer gender for voice ${voiceId}. Pass --gender=male or --gender=female.`,
    );
  }

  return TtsDiagnosticOptionsSchema.parse({
    output: values.get("output"),
    repetitions: values.get("repetitions"),
    voiceId,
    gender,
    asrRoundTrip,
  });
};

const ensureEmptyOutputDirectory = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
  const existing = await readdir(path);

  if (existing.length > 0) {
    throw new Error(
      `Diagnostic output directory is not empty: ${path}. Choose a fresh directory.`,
    );
  }
};

const buildAsrSocketUrl = (serviceUrl: string, sessionId: string): string => {
  const base = serviceUrl.replace(/\/+$/, "");
  const scheme = base.startsWith("https://") ? "wss://" : "ws://";

  return `${scheme}${base.replace(/^https?:\/\//, "")}/v1/ws/${sessionId}`;
};

const createAsrSession = async (
  serviceUrl: string,
): Promise<z.infer<typeof AsrSessionSchema>> => {
  const response = await fetch(
    `${serviceUrl.replace(/\/+$/, "")}/v1/sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: "ru" }),
      signal: AbortSignal.timeout(5_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ASR session creation failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  return AsrSessionSchema.parse(await response.json());
};

const recogniseGeneratedAudio = async (
  pcm: Uint8Array,
  expectedText: string,
): Promise<TtsDiagnosticAsrResult> => {
  const serviceUrl = process.env.ASR_SERVICE_URL ?? DEFAULT_ASR_SERVICE_URL;
  const session = await createAsrSession(serviceUrl);
  const audio = resamplePcm16Mono(pcm, 24_000, session.sampleRate);
  const frameBytes = (session.sampleRate * 2 * ASR_FRAME_MS) / 1_000;

  return new Promise<TtsDiagnosticAsrResult>((resolveResult, rejectResult) => {
    const socket = new WebSocket(
      buildAsrSocketUrl(serviceUrl, session.sessionId),
    );
    let settled = false;
    const phrases: string[] = [];
    let audioMs = 0;
    let processingMs = 0;

    /** Реплика целиком: фразы через пробел, длительности в сумме. */
    function collected(): TtsDiagnosticAsrResult {
      const transcript = phrases
        .filter((phrase) => phrase.length > 0)
        .join(" ");

      return {
        transcript,
        audioMs,
        processingMs,
        characterErrorRate: characterErrorRate(expectedText, transcript),
      };
    }

    function settle(
      error: Error | null,
      result?: TtsDiagnosticAsrResult,
    ): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.close();

      if (error !== null) {
        rejectResult(error);
      } else if (result !== undefined) {
        resolveResult(result);
      }
    }

    const timeout = setTimeout(() => {
      settle(new Error("ASR round-trip did not finish in time"));
    }, ASR_TIMEOUT_MS);

    socket.on("message", (data) => {
      let event: z.infer<typeof AsrEventSchema>;

      try {
        event = AsrEventSchema.parse(JSON.parse(data.toString()) as unknown);
      } catch (error) {
        settle(
          error instanceof Error
            ? error
            : new Error("ASR returned an invalid event"),
        );
        return;
      }

      if (event.type === "ready") {
        for (let offset = 0; offset < audio.byteLength; offset += frameBytes) {
          socket.send(audio.subarray(offset, offset + frameBytes));
        }
        socket.send(JSON.stringify({ type: "stop" }));
        return;
      }

      if (event.type === "final") {
        // Распознавание само режет запись на фразы по паузам, а диагностика
        // сравнивает с эталоном всю реплику: по первой фразе синтез выглядел бы
        // хуже, чем он есть.
        phrases.push(event.transcript.trim());
        audioMs += event.audioMs;
        processingMs += event.processingMs;

        if (event.reason === "silence") {
          return;
        }

        settle(null, collected());
        return;
      }

      if (event.type === "error") {
        settle(new Error(`ASR rejected diagnostic audio: ${event.message}`));
      }
    });

    socket.on("error", (error) => settle(error));
    socket.on("close", () => {
      if (settled) {
        return;
      }

      settle(
        phrases.some((phrase) => phrase.length > 0)
          ? null
          : new Error("ASR closed before returning a final transcript"),
        collected(),
      );
    });
  });
};

const synthesize = async (
  service: SpeechSynthesisService,
  request: TtsSynthesisRequest,
): Promise<{
  readonly pcm: Uint8Array;
  readonly metrics: SpeechSynthesisMetrics;
}> => {
  const chunks: AudioChunk["audio"][] = [];
  let metrics: SpeechSynthesisMetrics | null = null;

  for await (const event of service.synthesize(
    request,
    AbortSignal.timeout(DIAGNOSTIC_TIMEOUT_MS),
  )) {
    if (event.type === "audio.chunk") {
      chunks.push(event.chunk.audio);
    } else {
      metrics = event.metrics;
    }
  }

  if (metrics === null) {
    throw new Error("TTS stream ended without completion metrics");
  }

  return { pcm: concatPcmChunks(chunks), metrics };
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const output = resolve(options.output);
  await ensureEmptyOutputDirectory(output);

  const config = parseTtsConfig(selectEnvironment(TTS_ENVIRONMENT_KEYS));
  const adapter = new PiperTtsAdapter(
    config,
    globalThis.fetch.bind(globalThis),
  );
  const service = new SpeechSynthesisService(adapter, new TtsStreamValidator());
  const entries: TtsDiagnosticEntry[] = [];

  for (const diagnosticCase of TTS_DIAGNOSTIC_CASES) {
    for (
      let repetition = 1;
      repetition <= options.repetitions;
      repetition += 1
    ) {
      const suffix = `r${String(repetition).padStart(2, "0")}`;
      const request: TtsSynthesisRequest = {
        requestId: `tts-diagnostic-${diagnosticCase.id}-${suffix}`,
        sessionId: "tts-diagnostic",
        text: diagnosticCase.text,
        language: "Russian",
        voiceId: options.voiceId,
        gender: options.gender,
        emotion: diagnosticCase.emotion,
        intensity: diagnosticCase.intensity,
        speechRate: diagnosticCase.speechRate,
      };
      const generated = await synthesize(service, request);
      const asr = options.asrRoundTrip
        ? await recogniseGeneratedAudio(generated.pcm, diagnosticCase.text)
        : null;
      const artifact = createTtsDiagnosticArtifact({
        diagnosticCase,
        repetition,
        request,
        pcm: generated.pcm,
        metrics: generated.metrics,
        asr,
      });

      await writeFile(join(output, artifact.entry.artifact), artifact.wav, {
        flag: "wx",
      });
      entries.push(artifact.entry);
      console.log(
        `${diagnosticCase.id} ${suffix}: ${artifact.entry.audioDurationMs} ms, ${artifact.entry.sha256.slice(0, 12)}`,
      );
    }
  }

  const manifest = createTtsDiagnosticManifest({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      requestTimeoutMs: config.requestTimeoutMs,
    },
    options: {
      repetitions: options.repetitions,
      voiceId: options.voiceId,
      asrRoundTrip: options.asrRoundTrip,
    },
    entries,
  });

  const manifestPath = join(output, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  console.log(`Manifest: ${manifestPath}`);
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
