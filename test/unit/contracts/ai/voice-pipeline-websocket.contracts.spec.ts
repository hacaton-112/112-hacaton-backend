import {
  VoicePipelineClientCommandSchema,
  VoicePipelineServerEventSchema,
} from "@/contracts/ai/voice-pipeline-websocket.contracts";

const metadata = {
  eventId: "event-1",
  sessionId: "session-1",
  timestamp: "2026-09-07T12:00:00.000Z",
};

describe("voice pipeline WebSocket contracts", () => {
  it("accepts strict speak and cancel commands", () => {
    expect(
      VoicePipelineClientCommandSchema.parse({
        type: "speak",
        operatorText: "Что произошло?",
        voiceId: "Vivian",
      }),
    ).toEqual({
      type: "speak",
      operatorText: "Что произошло?",
      voiceId: "Vivian",
    });
    expect(VoicePipelineClientCommandSchema.parse({ type: "cancel" })).toEqual({
      type: "cancel",
    });
  });

  it("rejects empty text, invalid voice IDs, and unknown fields", () => {
    expect(
      VoicePipelineClientCommandSchema.safeParse({
        type: "speak",
        operatorText: " ",
      }).success,
    ).toBe(false);
    expect(
      VoicePipelineClientCommandSchema.safeParse({
        type: "speak",
        operatorText: "Что произошло?",
        voiceId: "invalid voice",
      }).success,
    ).toBe(false);
    expect(
      VoicePipelineClientCommandSchema.safeParse({
        type: "cancel",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("accepts session recovery commands and snapshots", () => {
    expect(
      VoicePipelineClientCommandSchema.parse({
        type: "resume",
        sessionId: "session-1",
        resumeListening: true,
      }),
    ).toEqual({
      type: "resume",
      sessionId: "session-1",
      resumeListening: true,
      // Режим по умолчанию голосовой: старый клиент о текстовом не знает.
      channel: "voice",
    });

    expect(
      VoicePipelineServerEventSchema.safeParse({
        ...metadata,
        type: "call.resumed",
        channel: "voice",
        scenarioCode: "S-015",
        title: "Пожар в квартире",
        locator: null,
        revealedFactKeys: ["address"],
        dialogue: [{ role: "operator", text: "Назовите адрес" }],
        offeredAt: "2026-09-07T11:59:00.000Z",
        answeredAt: "2026-09-07T11:59:05.000Z",
        recoveryWindowSeconds: 30,
        stage: "conversation",
        panicLevel: 2,
        checklistTotal: 5,
        checklistSatisfied: 1,
        answerNormSeconds: 240,
      }).success,
    ).toBe(true);
  });

  it("accepts typed reply, audio lifecycle, cancellation, and error events", () => {
    const attempts = [
      {
        attempt: 1,
        timeToFirstTokenMs: 10,
        durationMs: 20,
        outcome: "success" as const,
      },
    ];
    const synthesis = {
      timeToFirstAudioMs: 10,
      durationMs: 20,
      chunkCount: 1,
      audioBytes: 2,
      attempts: [{ attempt: 1, durationMs: 20, outcome: "success" as const }],
    };

    const events = [
      {
        ...metadata,
        type: "reply.text",
        requestId: "request-1",
        text: "На кухне пожар.",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1,
        revealedFactIds: ["fire-location"],
        endCall: false,
        source: "model",
        attempts,
        timeToReplyMs: 20,
      },
      {
        ...metadata,
        type: "audio.start",
        requestId: "request-1",
        streamId: "request-1",
        sampleRate: 24_000,
        channels: 1,
        format: "pcm_s16le",
      },
      {
        ...metadata,
        type: "audio.done",
        requestId: "request-1",
        metrics: {
          timeToReplyMs: 20,
          timeToFirstAudioMs: 30,
          durationMs: 40,
          generation: { source: "model", attempts },
          synthesis,
        },
      },
      {
        ...metadata,
        type: "audio.done",
        requestId: "opening-1",
        metrics: {
          kind: "prescribed",
          minimumResponseDelayMs: 220,
          timeToFirstAudioMs: 240,
          durationMs: 280,
          synthesis,
        },
      },
      {
        ...metadata,
        type: "request.cancelled",
        requestId: "request-1",
      },
      {
        ...metadata,
        type: "error",
        requestId: null,
        code: "invalid-message",
        message: "Invalid voice pipeline command",
      },
    ];

    for (const event of events) {
      expect(VoicePipelineServerEventSchema.safeParse(event).success).toBe(
        true,
      );
    }
  });

  it("requires event metadata and rejects unknown response fields", () => {
    expect(
      VoicePipelineServerEventSchema.safeParse({
        type: "request.cancelled",
        requestId: "request-1",
      }).success,
    ).toBe(false);
    expect(
      VoicePipelineServerEventSchema.safeParse({
        ...metadata,
        type: "request.cancelled",
        requestId: "request-1",
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
