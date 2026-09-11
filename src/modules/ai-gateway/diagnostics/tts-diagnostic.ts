import { createHash } from "node:crypto";

import { z } from "zod";

import {
  AiIdentifierSchema,
  SpeechSynthesisMetricsSchema,
  TtsSynthesisRequestSchema,
  type SpeechSynthesisMetrics,
  type TtsSynthesisRequest,
} from "@/contracts";
import { encodeWav, pcmDurationMs } from "@/modules/call-recording/domain/wav";

import {
  QWEN_TTS_SAMPLE_RATE,
  QwenTtsModeSchema,
  QwenTtsProviderSchema,
} from "../adapters/qwen-tts/qwen-tts.config";

const PcmSchema = z
  .instanceof(Uint8Array)
  .refine(
    (pcm) => pcm.byteLength > 0 && pcm.byteLength % 2 === 0,
    "Diagnostic PCM must contain complete signed 16-bit samples",
  );

export const TtsDiagnosticCaseSchema = z
  .object({
    id: AiIdentifierSchema,
    text: TtsSynthesisRequestSchema.shape.text,
    emotion: TtsSynthesisRequestSchema.shape.emotion,
    intensity: TtsSynthesisRequestSchema.shape.intensity,
    speechRate: TtsSynthesisRequestSchema.shape.speechRate,
  })
  .strict();

export type TtsDiagnosticCase = z.infer<typeof TtsDiagnosticCaseSchema>;

/**
 * Синтетический набор намеренно мал: один запуск должен быстро показать,
 * удерживает ли один голос тембр при смене содержания и степени паники.
 */
export const TTS_DIAGNOSTIC_CASES = [
  {
    id: "calm-address",
    text: "Адрес: улица Учебная, дом двенадцать, квартира тридцать четыре.",
    emotion: "calm",
    intensity: 0.22,
    speechRate: 1,
  },
  {
    id: "anxious-smoke",
    text: "В подъезде сильный дым, я вышел во двор и жду пожарных.",
    emotion: "anxious",
    intensity: 0.6,
    speechRate: 1.15,
  },
  {
    id: "panic-children",
    text: "Там дети! Они остались на пятом этаже, приезжайте быстрее!",
    emotion: "panic",
    intensity: 0.92,
    speechRate: 1.3,
  },
] as const satisfies readonly TtsDiagnosticCase[];

export const TtsDiagnosticAsrResultSchema = z
  .object({
    transcript: z.string(),
    audioMs: z.number().nonnegative(),
    processingMs: z.number().nonnegative(),
    characterErrorRate: z.number().nonnegative(),
  })
  .strict();

export type TtsDiagnosticAsrResult = z.infer<
  typeof TtsDiagnosticAsrResultSchema
>;

export const TtsDiagnosticEntrySchema = z
  .object({
    caseId: AiIdentifierSchema,
    repetition: z.number().int().positive(),
    artifact: z.string().min(1),
    request: TtsSynthesisRequestSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    audioBytes: z.number().int().positive().multipleOf(2),
    audioDurationMs: z.number().int().positive(),
    metrics: SpeechSynthesisMetricsSchema,
    asr: TtsDiagnosticAsrResultSchema.nullable(),
  })
  .strict();

export type TtsDiagnosticEntry = z.infer<typeof TtsDiagnosticEntrySchema>;

export const TtsDiagnosticManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.string().datetime(),
    provider: z
      .object({
        provider: QwenTtsProviderSchema,
        mode: QwenTtsModeSchema,
        baseUrl: z.url(),
        model: z.string().min(1),
        requestTimeoutMs: z.number().int().positive(),
        streamingIntervalSeconds: z.number().positive().nullable(),
        reference: z
          .object({
            id: AiIdentifierSchema,
            source: z.literal("synthetic"),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    options: z
      .object({
        repetitions: z.number().int().positive(),
        voiceId: AiIdentifierSchema,
        asrRoundTrip: z.boolean(),
      })
      .strict(),
    entries: z.array(TtsDiagnosticEntrySchema).min(1),
  })
  .strict();

export type TtsDiagnosticManifest = z.infer<typeof TtsDiagnosticManifestSchema>;

export const concatPcmChunks = (
  chunks: readonly Uint8Array[],
): Uint8Array<ArrayBuffer> => {
  const byteLength = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const pcm = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return PcmSchema.parse(pcm) as Uint8Array<ArrayBuffer>;
};

export const createTtsDiagnosticArtifact = (input: {
  readonly diagnosticCase: TtsDiagnosticCase;
  readonly repetition: number;
  readonly request: TtsSynthesisRequest;
  readonly pcm: Uint8Array;
  readonly metrics: SpeechSynthesisMetrics;
  readonly asr: TtsDiagnosticAsrResult | null;
}): { readonly entry: TtsDiagnosticEntry; readonly wav: Uint8Array } => {
  const diagnosticCase = TtsDiagnosticCaseSchema.parse(input.diagnosticCase);
  const request = TtsSynthesisRequestSchema.parse(input.request);
  const metrics = SpeechSynthesisMetricsSchema.parse(input.metrics);
  const pcm = PcmSchema.parse(input.pcm);
  const repetition = z.number().int().positive().parse(input.repetition);
  const artifact = `${diagnosticCase.id}-r${String(repetition).padStart(2, "0")}.wav`;

  return {
    entry: TtsDiagnosticEntrySchema.parse({
      caseId: diagnosticCase.id,
      repetition,
      artifact,
      request,
      sha256: createHash("sha256").update(pcm).digest("hex"),
      audioBytes: pcm.byteLength,
      audioDurationMs: pcmDurationMs(pcm.byteLength, QWEN_TTS_SAMPLE_RATE),
      metrics,
      asr: input.asr,
    }),
    wav: encodeWav(pcm, QWEN_TTS_SAMPLE_RATE),
  };
};

export const createTtsDiagnosticManifest = (
  input: TtsDiagnosticManifest,
): TtsDiagnosticManifest => TtsDiagnosticManifestSchema.parse(input);

/** Линейная передискретизация нужна только для диагностического ASR round-trip. */
export const resamplePcm16Mono = (
  rawPcm: Uint8Array,
  sourceRate: number,
  targetRate: number,
): Uint8Array<ArrayBuffer> => {
  const pcm = PcmSchema.parse(rawPcm);
  const validatedSourceRate = z.number().int().positive().parse(sourceRate);
  const validatedTargetRate = z.number().int().positive().parse(targetRate);
  const source = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const sourceSamples = pcm.byteLength / 2;
  const targetSamples = Math.max(
    1,
    Math.floor((sourceSamples * validatedTargetRate) / validatedSourceRate),
  );
  const result = new Uint8Array(targetSamples * 2);
  const target = new DataView(result.buffer);

  for (let index = 0; index < targetSamples; index += 1) {
    const sourcePosition = (index * validatedSourceRate) / validatedTargetRate;
    const leftIndex = Math.min(Math.floor(sourcePosition), sourceSamples - 1);
    const rightIndex = Math.min(leftIndex + 1, sourceSamples - 1);
    const fraction = sourcePosition - leftIndex;
    const left = source.getInt16(leftIndex * 2, true);
    const right = source.getInt16(rightIndex * 2, true);
    const sample = Math.round(left + (right - left) * fraction);

    target.setInt16(index * 2, sample, true);
  }

  return result;
};

const normalizeForComparison = (text: string): string =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "");

export const characterErrorRate = (
  expectedText: string,
  transcript: string,
): number => {
  const expected = normalizeForComparison(expectedText);
  const actual = normalizeForComparison(transcript);

  if (expected.length === 0) {
    return actual.length === 0 ? 0 : 1;
  }

  const previous = Array.from(
    { length: actual.length + 1 },
    (_, index) => index,
  );

  for (
    let expectedIndex = 1;
    expectedIndex <= expected.length;
    expectedIndex += 1
  ) {
    let diagonal = previous[0];
    previous[0] = expectedIndex;

    for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
      const above = previous[actualIndex];
      const substitution =
        diagonal +
        (expected[expectedIndex - 1] === actual[actualIndex - 1] ? 0 : 1);
      const insertion = previous[actualIndex - 1] + 1;
      const deletion = above + 1;

      previous[actualIndex] = Math.min(substitution, insertion, deletion);
      diagonal = above;
    }
  }

  return Number((previous[actual.length] / expected.length).toFixed(4));
};
