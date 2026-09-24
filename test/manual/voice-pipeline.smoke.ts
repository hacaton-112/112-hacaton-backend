import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import { z } from "zod";

import {
  AiIdentifierSchema,
  type AudioChunk,
  type GenerateCallerReplyRequest,
  type LlmStreamEvent,
  type SpeechSynthesisMetrics,
  type TtsSynthesisRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";
import { AliceAiLlmAdapter } from "@/modules/ai-gateway/adapters/alice-ai/alice-ai.adapter";
import {
  type AliceAiEnvironment,
  parseAliceAiConfig,
} from "@/modules/ai-gateway/adapters/alice-ai/alice-ai.config";
import {
  LocalLlmAdapter,
  LocalLlmConfigSchema,
} from "@/modules/ai-gateway/adapters/local-llm/local-llm.adapter";
import {
  type QwenTtsEnvironment,
  parseQwenTtsConfig,
} from "@/modules/ai-gateway/adapters/qwen-tts/qwen-tts.config";
import { createQwenTtsAdapter } from "@/modules/ai-gateway/adapters/qwen-tts/qwen-tts.factory";
import type { LlmPort, TtsPort } from "@/modules/ai-gateway";
import { CallerReplySafetyService } from "@/modules/dialogue-generation/application/caller-reply-safety.service";
import { DialogueGenerationService } from "@/modules/dialogue-generation/application/dialogue-generation.service";
import { LlmReplyStreamCollector } from "@/modules/dialogue-generation/application/llm-reply-stream.collector";
import { SpeechSynthesisService } from "@/modules/speech-synthesis/application/speech-synthesis.service";
import { TtsStreamValidator } from "@/modules/speech-synthesis/application/tts-stream.validator";
import { VoicePipelineService } from "@/modules/voice-pipeline/application/voice-pipeline.service";

const SmokeModeSchema = z.enum(["generation", "tts", "pipeline"]);
const SmokeOptionsSchema = z
  .object({
    mode: SmokeModeSchema.default("pipeline"),
    voiceId: AiIdentifierSchema.default("Vivian"),
  })
  .strict();

const ProviderErrorSummarySchema = z
  .object({
    name: z.string(),
    message: z.string(),
    code: z.union([z.string(), z.number()]).optional(),
    status: z.number().optional(),
    retryable: z.boolean().optional(),
  })
  .strict();

type ProviderErrorSummary = z.infer<typeof ProviderErrorSummarySchema>;

const ALICE_ENVIRONMENT_KEYS = [
  "YANDEX_AI_API_KEY",
  "YANDEX_AI_FOLDER_ID",
  "YANDEX_AI_BASE_URL",
  "YANDEX_AI_MODEL",
  "YANDEX_AI_REQUEST_TIMEOUT_MS",
] as const satisfies readonly (keyof AliceAiEnvironment)[];

const LOCAL_LLM_ENVIRONMENT_KEYS = [
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_API_KEY",
  "LLM_TIMEOUT_MS",
  "LLM_CONCURRENCY",
  "LLM_REPLY_PROTOCOL",
] as const;

const QWEN_ENVIRONMENT_KEYS = [
  "TTS_PROVIDER",
  "TTS_MODE",
  "TTS_BASE_URL",
  "TTS_MODEL",
  "TTS_REFERENCE_VOICES_PATH",
  "TTS_STREAMING_INTERVAL_SECONDS",
  "TTS_REQUEST_TIMEOUT_MS",
  "PIPER_TTS_BASE_URL",
  "PIPER_TTS_MALE_VOICE",
  "PIPER_TTS_FEMALE_VOICE",
] as const satisfies readonly (keyof QwenTtsEnvironment)[];

const selectEnvironment = (keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map((key) => [key, process.env[key]]));

const summarizeError = (error: unknown): ProviderErrorSummary => {
  const errorRecord =
    typeof error === "object" && error !== null ? error : null;

  return ProviderErrorSummarySchema.parse({
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
    code:
      errorRecord !== null && "code" in errorRecord
        ? z.union([z.string(), z.number()]).safeParse(errorRecord.code).data
        : undefined,
    status:
      errorRecord !== null && "status" in errorRecord
        ? z.number().safeParse(errorRecord.status).data
        : undefined,
    retryable:
      errorRecord !== null && "retryable" in errorRecord
        ? z.boolean().safeParse(errorRecord.retryable).data
        : undefined,
  });
};

class ObservedLlmPort implements LlmPort {
  public readonly errors: ProviderErrorSummary[] = [];

  constructor(private readonly inner: LlmPort) {}

  async *streamReply(
    request: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    try {
      yield* this.inner.streamReply(request, signal);
    } catch (error) {
      this.errors.push(summarizeError(error));
      throw error;
    }
  }
}

class ObservedTtsPort implements TtsPort {
  public readonly errors: ProviderErrorSummary[] = [];

  constructor(private readonly inner: TtsPort) {}

  async *synthesize(
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    try {
      yield* this.inner.synthesize(request, signal);
    } catch (error) {
      this.errors.push(summarizeError(error));
      throw error;
    }
  }
}

class AudioArtifactWriter {
  private readonly output: ReturnType<typeof createWriteStream>;
  public readonly pcmPath: string;
  public readonly wavPath: string;
  public chunkCount = 0;
  public byteLength = 0;

  constructor(mode: "tts" | "pipeline") {
    const baseName = `system112-${mode}-${randomUUID()}`;
    this.pcmPath = join(tmpdir(), `${baseName}.pcm`);
    this.wavPath = join(tmpdir(), `${baseName}.wav`);
    this.output = createWriteStream(this.pcmPath);
  }

  async write(audio: AudioChunk["audio"]): Promise<void> {
    this.chunkCount += 1;
    this.byteLength += audio.byteLength;

    if (!this.output.write(audio)) {
      await once(this.output, "drain");
    }
  }

  async complete(): Promise<{
    pcmPath: string;
    wavPath: string;
    chunkCount: number;
    audioBytes: number;
    audioDurationSeconds: number;
  }> {
    this.output.end();
    await finished(this.output);
    await writeWavFile(this.pcmPath, this.wavPath);

    return {
      pcmPath: this.pcmPath,
      wavPath: this.wavPath,
      chunkCount: this.chunkCount,
      audioBytes: this.byteLength,
      audioDurationSeconds: this.byteLength / (24_000 * 1 * 2),
    };
  }

  abort(): void {
    this.output.destroy();
  }
}

const writeWavFile = async (
  pcmPath: string,
  wavPath: string,
): Promise<void> => {
  const pcm = await readFile(pcmPath);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(24_000 * 1 * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.byteLength, 40);

  await writeFile(wavPath, Buffer.concat([header, pcm]));
};

const createGenerationRequest = (
  requestId: string,
): GenerateCallerReplyRequest => ({
  requestId,
  sessionId: "synthetic-session-1",
  scenarioVersionId: "synthetic-fire-v1",
  operatorText: "Служба 112. Что произошло и по какому адресу?",
  replyProtocol:
    process.env.LLM_REPLY_PROTOCOL === "caller-v2" ? "caller-v2" : "legacy",
  panicLevel: 3,
  callerTurns: 0,
  context: {
    persona: {
      id: "synthetic-caller-1",
      description:
        "Взрослая женщина, говорит коротко и тревожно, не добавляет неизвестных деталей.",
      language: "Russian",
    },
    allowedFacts: [
      {
        id: "incident_type",
        value: "На кухне квартиры начался пожар.",
      },
      {
        id: "address",
        value: "Адрес: улица Учебная, дом 12, квартира 34.",
      },
    ],
    recentTurns: [],
  },
});

const createDialogueRuntime = () => {
  if (process.env.LLM_PROVIDER === "local") {
    const environment = selectEnvironment(LOCAL_LLM_ENVIRONMENT_KEYS);
    const config = LocalLlmConfigSchema.parse({
      baseUrl: environment.LLM_BASE_URL,
      model: environment.LLM_MODEL,
      apiKey: environment.LLM_API_KEY,
      timeoutMs: environment.LLM_TIMEOUT_MS,
      concurrency: environment.LLM_CONCURRENCY,
      replyProtocol: environment.LLM_REPLY_PROTOCOL,
    });
    const port = new ObservedLlmPort(
      new LocalLlmAdapter(config, globalThis.fetch.bind(globalThis)),
    );
    const service = new DialogueGenerationService(
      port,
      new LlmReplyStreamCollector(new CallerReplySafetyService()),
    );

    return { config, port, service };
  }

  const config = parseAliceAiConfig(selectEnvironment(ALICE_ENVIRONMENT_KEYS));
  const port = new ObservedLlmPort(
    new AliceAiLlmAdapter(config, globalThis.fetch.bind(globalThis)),
  );
  const service = new DialogueGenerationService(
    port,
    new LlmReplyStreamCollector(new CallerReplySafetyService()),
  );

  return { config, port, service };
};

const createSpeechRuntime = () => {
  const config = parseQwenTtsConfig(selectEnvironment(QWEN_ENVIRONMENT_KEYS));
  const port = new ObservedTtsPort(
    createQwenTtsAdapter(config, globalThis.fetch.bind(globalThis)),
  );
  const service = new SpeechSynthesisService(port, new TtsStreamValidator());

  return { config, port, service };
};

const runGeneration = async () => {
  const runtime = createDialogueRuntime();
  const startedAt = performance.now();
  const result = await runtime.service.generate(
    createGenerationRequest(`manual-generation-${Date.now()}`),
    AbortSignal.timeout(300_000),
  );

  return {
    status: result.source === "model" ? "ok" : "fallback",
    mode: "generation",
    provider: {
      baseUrl: runtime.config.baseUrl,
      model: runtime.config.model,
      requestTimeoutMs:
        "requestTimeoutMs" in runtime.config
          ? runtime.config.requestTimeoutMs
          : runtime.config.timeoutMs,
    },
    result,
    providerErrors: runtime.port.errors,
    durationMs: performance.now() - startedAt,
  };
};

const runTts = async (voiceId: string) => {
  const runtime = createSpeechRuntime();
  const requestId = `manual-tts-${Date.now()}`;
  const writer = new AudioArtifactWriter("tts");
  let metrics: SpeechSynthesisMetrics | null = null;

  try {
    for await (const event of runtime.service.synthesize(
      {
        requestId,
        sessionId: "synthetic-session-1",
        text: "На кухне пожар, идёт сильный дым.",
        language: "Russian",
        voiceId,
        gender: "female",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1,
      },
      AbortSignal.timeout(300_000),
    )) {
      if (event.type === "audio.chunk") {
        await writer.write(event.chunk.audio);
      } else {
        metrics = event.metrics;
      }
    }

    if (metrics === null) {
      throw new Error("TTS stream ended without completion metrics");
    }

    return {
      status: "ok",
      mode: "tts",
      provider: runtime.config,
      voiceId,
      metrics,
      artifacts: await writer.complete(),
      providerErrors: runtime.port.errors,
    };
  } catch (error) {
    writer.abort();
    throw error;
  }
};

const runPipeline = async (voiceId: string) => {
  const dialogueRuntime = createDialogueRuntime();
  const speechRuntime = createSpeechRuntime();
  const pipeline = new VoicePipelineService(
    dialogueRuntime.service,
    speechRuntime.service,
  );
  const writer = new AudioArtifactWriter("pipeline");
  const generation = createGenerationRequest(`manual-pipeline-${Date.now()}`);
  let replyEvent: Extract<
    VoicePipelineStreamEvent,
    { type: "voice.reply.ready" }
  > | null = null;
  let completedEvent: Extract<
    VoicePipelineStreamEvent,
    { type: "voice.completed" }
  > | null = null;

  try {
    for await (const event of pipeline.streamReply(
      {
        generation,
        voice: {
          voiceId,
          gender: "female",
          emotion: "panic",
          intensity: 0.8,
          speechRate: 1,
        },
      },
      AbortSignal.timeout(300_000),
    )) {
      if (event.type === "voice.reply.ready") {
        replyEvent = event;
      } else if (event.type === "voice.audio.chunk") {
        await writer.write(event.chunk.audio);
      } else if (event.type === "voice.completed") {
        completedEvent = event;
      }
    }

    if (replyEvent === null || completedEvent === null) {
      throw new Error("Voice pipeline ended without terminal events");
    }

    return {
      status: replyEvent.result.source === "model" ? "ok" : "fallback",
      mode: "pipeline",
      voiceId,
      reply: replyEvent,
      completion: completedEvent,
      artifacts: await writer.complete(),
      providerErrors: {
        llm: dialogueRuntime.port.errors,
        tts: speechRuntime.port.errors,
      },
    };
  } catch (error) {
    writer.abort();
    throw error;
  }
};

const main = async (): Promise<void> => {
  const options = SmokeOptionsSchema.parse({
    mode: process.argv[2],
    voiceId: process.argv[3],
  });
  const result =
    options.mode === "generation"
      ? await runGeneration()
      : options.mode === "tts"
        ? await runTts(options.voiceId)
        : await runPipeline(options.voiceId);

  console.log(JSON.stringify(result, null, 2));
};

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: summarizeError(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
