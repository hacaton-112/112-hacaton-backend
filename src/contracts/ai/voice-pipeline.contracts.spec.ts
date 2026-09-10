import {
  PrescribedSpeechRequestSchema,
  VoicePipelineMetricsSchema,
  VoicePipelineRequestSchema,
  VoicePipelineStreamEventSchema,
} from "./voice-pipeline.contracts";

const validGenerationRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  scenarioVersionId: "scenario-version-1",
  operatorText: "Что произошло?",
  context: {
    persona: {
      id: "caller-1",
      description: "Взволнованный взрослый заявитель",
      language: "Russian",
    },
    allowedFacts: [{ id: "fire", value: "На кухне пожар" }],
    recentTurns: [],
    turnPlan: { reactionAct: "answer", minimumResponseDelayMs: 320 },
  },
} as const;

describe(
  PrescribedSpeechRequestSchema.description ?? "PrescribedSpeechRequestSchema",
  () => {
    it("accepts scenario text with a bounded response pause", () => {
      expect(
        PrescribedSpeechRequestSchema.safeParse({
          requestId: "opening-1",
          sessionId: "session-1",
          text: "Горит квартира!",
          language: "Russian",
          voice: {
            voiceId: "vivian",
            gender: "male",
            emotion: "panic",
            intensity: 0.8,
            speechRate: 1.2,
          },
          minimumResponseDelayMs: 220,
        }).success,
      ).toBe(true);
    });
  },
);

const validReply = {
  text: "На кухне пожар!",
  emotion: "panic",
  intensity: 0.8,
  speechRate: 1.1,
  revealedFactIds: ["fire"],
  endCall: false,
} as const;

const generationAttempts = [
  {
    attempt: 1,
    timeToFirstTokenMs: 20,
    durationMs: 80,
    outcome: "success",
  },
] as const;

const synthesisMetrics = {
  timeToFirstAudioMs: 30,
  durationMs: 100,
  chunkCount: 2,
  audioBytes: 8,
  attempts: [{ attempt: 1, durationMs: 100, outcome: "success" }],
} as const;

const validMetrics = {
  timeToReplyMs: 80,
  timeToFirstAudioMs: 120,
  durationMs: 200,
  generation: {
    source: "model",
    attempts: generationAttempts,
  },
  synthesis: synthesisMetrics,
} as const;

describe(
  VoicePipelineRequestSchema.description ?? "VoicePipelineRequestSchema",
  () => {
    const validVoice = {
      voiceId: "vivian",
      gender: "male",
      emotion: "panic",
      intensity: 0.7,
      speechRate: 1.2,
    } as const;

    it("accepts a prepared generation request and the voice it must use", () => {
      expect(
        VoicePipelineRequestSchema.safeParse({
          generation: validGenerationRequest,
          voice: validVoice,
        }).success,
      ).toBe(true);
    });

    it.each([
      [
        "invalid voice ID",
        {
          generation: validGenerationRequest,
          voice: { ...validVoice, voiceId: "bad voice" },
        },
      ],
      [
        "a caller who is neither a man nor a woman to the synthesiser",
        {
          generation: validGenerationRequest,
          voice: { ...validVoice, gender: "unspecified" },
        },
      ],
      [
        "an intensity outside the scale",
        {
          generation: validGenerationRequest,
          voice: { ...validVoice, intensity: 3 },
        },
      ],
      [
        "invalid generation request",
        {
          generation: { ...validGenerationRequest, operatorText: "" },
          voice: validVoice,
        },
      ],
      [
        "unknown field",
        {
          generation: validGenerationRequest,
          voice: validVoice,
          outputFormat: "wav",
        },
      ],
    ])("rejects %s", (_name, input) => {
      expect(VoicePipelineRequestSchema.safeParse(input).success).toBe(false);
    });
  },
);

describe(
  VoicePipelineMetricsSchema.description ?? "VoicePipelineMetricsSchema",
  () => {
    it("accepts full generation, synthesis, and end-to-end metrics", () => {
      expect(VoicePipelineMetricsSchema.safeParse(validMetrics).success).toBe(
        true,
      );
    });

    it.each([
      ["audio before reply", { ...validMetrics, timeToReplyMs: 121 }],
      ["duration before first audio", { ...validMetrics, durationMs: 119 }],
      [
        "pipeline audio latency shorter than synthesis latency",
        { ...validMetrics, timeToReplyMs: 0, timeToFirstAudioMs: 29 },
      ],
      [
        "pipeline duration shorter than synthesis duration",
        {
          ...validMetrics,
          timeToReplyMs: 0,
          timeToFirstAudioMs: 30,
          durationMs: 99,
        },
      ],
      ["unknown field", { ...validMetrics, asrDurationMs: 25 }],
    ])("rejects %s", (_name, metrics) => {
      expect(VoicePipelineMetricsSchema.safeParse(metrics).success).toBe(false);
    });
  },
);

describe(
  VoicePipelineStreamEventSchema.description ??
    "VoicePipelineStreamEventSchema",
  () => {
    it("accepts a validated reply event", () => {
      expect(
        VoicePipelineStreamEventSchema.safeParse({
          type: "voice.reply.ready",
          result: {
            reply: validReply,
            source: "model",
            attempts: generationAttempts,
          },
          timeToReplyMs: 80,
        }).success,
      ).toBe(true);
    });

    it("accepts an audio event without copying PCM", () => {
      const audio = new Uint8Array([0, 1, 2, 3]);
      const event = VoicePipelineStreamEventSchema.parse({
        type: "voice.audio.chunk",
        chunk: {
          streamId: "request-1",
          sequence: 0,
          sampleRate: 24_000,
          channels: 1,
          format: "pcm_s16le",
          isFinal: true,
          audio,
        },
      });

      expect(event.type).toBe("voice.audio.chunk");
      if (event.type === "voice.audio.chunk") {
        expect(event.chunk.audio).toBe(audio);
      }
    });

    it("accepts a completed event with full metrics", () => {
      expect(
        VoicePipelineStreamEventSchema.safeParse({
          type: "voice.completed",
          metrics: validMetrics,
        }).success,
      ).toBe(true);
    });

    it.each([
      ["unknown event", { type: "voice.started" }],
      [
        "unknown event field",
        {
          type: "voice.completed",
          metrics: validMetrics,
          sessionId: "session-1",
        },
      ],
    ])("rejects %s", (_name, event) => {
      expect(VoicePipelineStreamEventSchema.safeParse(event).success).toBe(
        false,
      );
    });
  },
);
