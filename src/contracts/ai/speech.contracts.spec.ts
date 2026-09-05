import {
  AudioChunkMetadataSchema,
  AudioChunkSchema,
  TtsSynthesisRequestSchema,
} from "./speech.contracts";

const validSynthesisRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  text: "Дым идёт из кухни!",
  language: "Russian",
  voiceId: "vivian",
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

describe(TtsSynthesisRequestSchema.description ?? "TtsSynthesisRequestSchema", () => {
  it("accepts a valid synthesis request", () => {
    expect(TtsSynthesisRequestSchema.safeParse(validSynthesisRequest).success).toBe(
      true,
    );
  });

  it.each([
    ["unsupported language", { ...validSynthesisRequest, language: "English" }],
    ["invalid voice ID", { ...validSynthesisRequest, voiceId: "caller voice" }],
    ["invalid intensity", { ...validSynthesisRequest, intensity: 1.1 }],
    ["invalid speech rate", { ...validSynthesisRequest, speechRate: 0.4 }],
    ["unknown field", { ...validSynthesisRequest, outputPath: "/tmp/audio.wav" }],
  ])("rejects %s", (_name, value) => {
    expect(TtsSynthesisRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe(AudioChunkMetadataSchema.description ?? "AudioChunkMetadataSchema", () => {
  it("accepts valid PCM stream metadata", () => {
    expect(AudioChunkMetadataSchema.safeParse(validChunkMetadata).success).toBe(true);
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
});

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
