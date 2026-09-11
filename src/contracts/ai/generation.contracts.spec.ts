import {
  CallerReplySchema,
  DialogueGenerationResultSchema,
  GenerateCallerReplyRequestSchema,
  MAX_ALLOWED_FACTS,
  MAX_CALLER_REPLY_LENGTH,
  MAX_RECENT_TURNS,
} from "./generation.contracts";

const validReply = {
  text: "Дым идёт из кухни, я очень боюсь!",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
  revealedFactIds: ["fire_location"],
  endCall: false,
} as const;

const validRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  scenarioVersionId: "scenario-version-1",
  operatorText: "Назовите адрес происшествия.",
  context: {
    persona: {
      id: "caller-1",
      description: "Взрослый заявитель в состоянии паники",
      language: "Russian",
    },
    allowedFacts: [
      {
        id: "fire_location",
        value: "Возгорание находится на кухне",
      },
    ],
    recentTurns: [
      {
        role: "operator",
        text: "Служба 112, что у вас случилось?",
      },
    ],
    turnPlan: {
      reactionAct: "answer",
      minimumResponseDelayMs: 320,
    },
  },
} as const;

describe(CallerReplySchema.description ?? "CallerReplySchema", () => {
  it("accepts a valid caller reply at supported boundaries", () => {
    expect(
      CallerReplySchema.safeParse({
        ...validReply,
        text: "а".repeat(MAX_CALLER_REPLY_LENGTH),
        intensity: 1,
        speechRate: 2,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["empty text", { ...validReply, text: "" }],
    [
      "overlong text",
      { ...validReply, text: "а".repeat(MAX_CALLER_REPLY_LENGTH + 1) },
    ],
    ["unknown emotion", { ...validReply, emotion: "surprised" }],
    ["negative intensity", { ...validReply, intensity: -0.01 }],
    ["excessive intensity", { ...validReply, intensity: 1.01 }],
    ["slow speech rate", { ...validReply, speechRate: 0.49 }],
    ["fast speech rate", { ...validReply, speechRate: 2.01 }],
    [
      "duplicate revealed facts",
      {
        ...validReply,
        revealedFactIds: ["fire_location", "fire_location"],
      },
    ],
    ["invalid fact ID", { ...validReply, revealedFactIds: ["fire location"] }],
    ["unknown field", { ...validReply, internalReasoning: "hidden" }],
  ])("rejects %s", (_name, value) => {
    expect(CallerReplySchema.safeParse(value).success).toBe(false);
  });
});

describe(
  GenerateCallerReplyRequestSchema.description ??
    "GenerateCallerReplyRequestSchema",
  () => {
    it("accepts a valid generation context", () => {
      expect(
        GenerateCallerReplyRequestSchema.safeParse(validRequest).success,
      ).toBe(true);
    });

    it("rejects duplicate allowed fact IDs", () => {
      const fact = validRequest.context.allowedFacts[0];
      const result = GenerateCallerReplyRequestSchema.safeParse({
        ...validRequest,
        context: {
          ...validRequest.context,
          allowedFacts: [fact, fact],
        },
      });

      expect(result.success).toBe(false);
    });

    it("rejects an invalid allowed fact ID", () => {
      const result = GenerateCallerReplyRequestSchema.safeParse({
        ...validRequest,
        context: {
          ...validRequest.context,
          allowedFacts: [{ id: "hidden fact", value: "Недопустимый факт" }],
        },
      });

      expect(result.success).toBe(false);
    });

    it("rejects a focused fact outside this turn's allowed facts", () => {
      const result = GenerateCallerReplyRequestSchema.safeParse({
        ...validRequest,
        context: {
          ...validRequest.context,
          turnPlan: {
            reactionAct: "answer",
            focusFactIds: ["hidden_fact"],
            minimumResponseDelayMs: 320,
          },
        },
      });

      expect(result.success).toBe(false);
    });

    it("rejects a fallback that reveals a fact outside the turn", () => {
      const result = GenerateCallerReplyRequestSchema.safeParse({
        ...validRequest,
        fallbackReply: {
          ...validReply,
          revealedFactIds: ["hidden_fact"],
        },
      });

      expect(result.success).toBe(false);
    });

    it("rejects contexts exceeding the fact limit", () => {
      const allowedFacts = Array.from(
        { length: MAX_ALLOWED_FACTS + 1 },
        (_, index) => ({
          id: `fact-${index}`,
          value: `Значение ${index}`,
        }),
      );

      expect(
        GenerateCallerReplyRequestSchema.safeParse({
          ...validRequest,
          context: { ...validRequest.context, allowedFacts },
        }).success,
      ).toBe(false);
    });

    it("rejects contexts exceeding the recent-turn limit", () => {
      const recentTurns = Array.from(
        { length: MAX_RECENT_TURNS + 1 },
        (_, index) => ({ role: "operator", text: `Реплика ${index}` }),
      );

      expect(
        GenerateCallerReplyRequestSchema.safeParse({
          ...validRequest,
          context: { ...validRequest.context, recentTurns },
        }).success,
      ).toBe(false);
    });

    it("rejects unknown context fields", () => {
      expect(
        GenerateCallerReplyRequestSchema.safeParse({
          ...validRequest,
          context: { ...validRequest.context, hiddenFacts: [] },
        }).success,
      ).toBe(false);
    });

    it("rejects an unknown reaction act or an excessive response pause", () => {
      expect(
        GenerateCallerReplyRequestSchema.safeParse({
          ...validRequest,
          context: {
            ...validRequest.context,
            turnPlan: {
              reactionAct: "improvise",
              minimumResponseDelayMs: 320,
            },
          },
        }).success,
      ).toBe(false);
      expect(
        GenerateCallerReplyRequestSchema.safeParse({
          ...validRequest,
          context: {
            ...validRequest.context,
            turnPlan: {
              reactionAct: "answer",
              minimumResponseDelayMs: 1_501,
            },
          },
        }).success,
      ).toBe(false);
    });
  },
);

describe(
  DialogueGenerationResultSchema.description ??
    "DialogueGenerationResultSchema",
  () => {
    const validResult = {
      reply: validReply,
      source: "model",
      attempts: [
        {
          attempt: 1,
          timeToFirstTokenMs: 12,
          durationMs: 40,
          outcome: "success",
        },
      ],
    } as const;

    it("accepts a valid generation result", () => {
      expect(
        DialogueGenerationResultSchema.safeParse(validResult).success,
      ).toBe(true);
    });

    it.each([
      [
        "unknown outcome",
        {
          ...validResult,
          attempts: [{ ...validResult.attempts[0], outcome: "timeout" }],
        },
      ],
      [
        "invalid attempt",
        {
          ...validResult,
          attempts: [{ ...validResult.attempts[0], attempt: 3 }],
        },
      ],
      ["unknown field", { ...validResult, provider: "alice-ai" }],
    ])("rejects %s", (_name, value) => {
      expect(DialogueGenerationResultSchema.safeParse(value).success).toBe(
        false,
      );
    });
  },
);
