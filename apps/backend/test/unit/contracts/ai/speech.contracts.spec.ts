import {
  AudioChunkMetadataSchema,
  AudioChunkSchema,
  SpeechSynthesisMetricsSchema,
  SpeechSynthesisStreamEventSchema,
  TtsSynthesisRequestSchema,
} from "@/contracts/ai/speech.contracts";

const validSynthesisRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  text: "Дым идёт из кухни!",
  language: "Russian",
  voiceId: "vivian",
  gender: "male",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
} as const;

const validChunkMetadata = {
  streamId: "stream-1",
  sequence: 0,
  sampleRate: 24_000,
  channels: 1,
  format: "pcm_s16le",
  isFinal: false,
} as const;

describe(
  TtsSynthesisRequestSchema.description ?? "TtsSynthesisRequestSchema",
  () => {
    it("accepts a valid synthesis request", () => {
      expect(
        TtsSynthesisRequestSchema.safeParse(validSynthesisRequest).success,
      ).toBe(true);
    });

    it.each([
      [
        "unsupported language",
        { ...validSynthesisRequest, language: "English" },
      ],
      [
        "invalid voice ID",
        { ...validSynthesisRequest, voiceId: "caller voice" },
      ],
      ["invalid intensity", { ...validSynthesisRequest, intensity: 1.1 }],
      ["invalid speech rate", { ...validSynthesisRequest, speechRate: 0.4 }],
      [
        "unknown field",
        { ...validSynthesisRequest, outputPath: "/tmp/audio.wav" },
      ],
    ])("rejects %s", (_name, value) => {
      expect(TtsSynthesisRequestSchema.safeParse(value).success).toBe(false);
    });
  },
);

describe(
  AudioChunkMetadataSchema.description ?? "AudioChunkMetadataSchema",
  () => {
    it("accepts valid PCM stream metadata", () => {
      expect(
        AudioChunkMetadataSchema.safeParse(validChunkMetadata).success,
      ).toBe(true);
    });

    it.each([
      ["negative sequence", { ...validChunkMetadata, sequence: -1 }],
      ["fractional sequence", { ...validChunkMetadata, sequence: 0.5 }],
      ["unsupported format", { ...validChunkMetadata, format: "wav" }],
      ["stereo channels", { ...validChunkMetadata, channels: 2 }],
      ["low sample rate", { ...validChunkMetadata, sampleRate: 7_999 }],
      ["high sample rate", { ...validChunkMetadata, sampleRate: 192_001 }],
      ["unknown field", { ...validChunkMetadata, durationMs: 320 }],
    ])("rejects %s", (_name, value) => {
      expect(AudioChunkMetadataSchema.safeParse(value).success).toBe(false);
    });
  },
);

describe(AudioChunkSchema.description ?? "AudioChunkSchema", () => {
  it("accepts an even-sized binary PCM payload", () => {
    expect(
      AudioChunkSchema.safeParse({
        ...validChunkMetadata,
        audio: new Uint8Array([0, 1, 2, 3]),
      }).success,
    ).toBe(true);
  });

  it.each([
    ["empty payload", new Uint8Array()],
    ["odd-sized payload", new Uint8Array([0, 1, 2])],
    ["non-binary payload", "AAEC"],
  ])("rejects %s", (_name, audio) => {
    expect(
      AudioChunkSchema.safeParse({ ...validChunkMetadata, audio }).success,
    ).toBe(false);
  });
});

describe(
  SpeechSynthesisStreamEventSchema.description ??
    "SpeechSynthesisStreamEventSchema",
  () => {
    it("accepts an audio event without copying its PCM payload", () => {
      const audio = new Uint8Array([0, 1, 2, 3]);
      const result = SpeechSynthesisStreamEventSchema.parse({
        type: "audio.chunk",
        chunk: { ...validChunkMetadata, audio },
      });

      expect(result.type).toBe("audio.chunk");
      if (result.type === "audio.chunk") {
        expect(result.chunk.audio).toBe(audio);
      }
    });

    it("accepts completion metrics for a retried synthesis", () => {
      expect(
        SpeechSynthesisStreamEventSchema.safeParse({
          type: "synthesis.completed",
          metrics: {
            timeToFirstAudioMs: 25,
            durationMs: 80,
            chunkCount: 2,
            audioBytes: 8,
            attempts: [
              { attempt: 1, durationMs: 10, outcome: "provider-error" },
              { attempt: 2, durationMs: 70, outcome: "success" },
            ],
          },
        }).success,
      ).toBe(true);
    });

    it.each([
      [
        "unknown event field",
        {
          type: "audio.chunk",
          chunk: {
            ...validChunkMetadata,
            audio: new Uint8Array([0, 1]),
          },
          encoded: true,
        },
      ],
      [
        "unknown outcome",
        {
          type: "synthesis.completed",
          metrics: {
            timeToFirstAudioMs: 10,
            durationMs: 20,
            chunkCount: 1,
            audioBytes: 2,
            attempts: [{ attempt: 1, durationMs: 20, outcome: "timeout" }],
          },
        },
      ],
    ])("rejects %s", (_name, event) => {
      expect(SpeechSynthesisStreamEventSchema.safeParse(event).success).toBe(
        false,
      );
    });
  },
);

describe(
  SpeechSynthesisMetricsSchema.description ?? "SpeechSynthesisMetricsSchema",
  () => {
    const validMetrics = {
      timeToFirstAudioMs: 10,
      durationMs: 20,
      chunkCount: 1,
      audioBytes: 2,
      attempts: [{ attempt: 1, durationMs: 20, outcome: "success" }],
    } as const;

    it.each([
      ["duration before first audio", { ...validMetrics, durationMs: 9 }],
      ["empty chunk count", { ...validMetrics, chunkCount: 0 }],
      ["odd PCM byte count", { ...validMetrics, audioBytes: 3 }],
      [
        "non-sequential attempts",
        {
          ...validMetrics,
          attempts: [{ attempt: 2, durationMs: 20, outcome: "success" }],
        },
      ],
      [
        "unsuccessful completed attempt",
        {
          ...validMetrics,
          attempts: [{ attempt: 1, durationMs: 20, outcome: "provider-error" }],
        },
      ],
      ["unknown field", { ...validMetrics, sampleRate: 24_000 }],
    ])("rejects %s", (_name, metrics) => {
      expect(SpeechSynthesisMetricsSchema.safeParse(metrics).success).toBe(
        false,
      );
    });
  },
);
