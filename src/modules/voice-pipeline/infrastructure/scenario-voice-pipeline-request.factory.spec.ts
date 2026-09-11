import type { CallerReply, DialogueGenerationResult } from "@/contracts";
import type { ScenarioEngineService } from "@/modules/scenario-engine";

import { ScenarioVoicePipelineRequestFactory } from "./scenario-voice-pipeline-request.factory";

const fallbackReply: CallerReply = {
  text: "Улица Учебная, дом 12.",
  emotion: "panic",
  intensity: 0.8,
  speechRate: 1.1,
  revealedFactIds: ["address"],
  endCall: false,
};

const generation: Pick<DialogueGenerationResult, "source" | "attempts"> = {
  source: "fallback",
  attempts: [
    {
      attempt: 1,
      timeToFirstTokenMs: null,
      durationMs: 20,
      outcome: "provider-error",
    },
  ],
};

describe(ScenarioVoicePipelineRequestFactory.name, () => {
  it("passes the focused context and situational fallback to generation", async () => {
    const engine = {
      buildGenerationContext: jest.fn().mockResolvedValue({
        scenarioVersionId: "scenario-version-1",
        context: {
          persona: {
            id: "caller-1",
            description: "Взволнованный заявитель",
            language: "Russian",
          },
          allowedFacts: [{ id: "address", value: fallbackReply.text }],
          recentTurns: [],
          turnPlan: {
            reactionAct: "answer",
            focusFactIds: ["address"],
            minimumResponseDelayMs: 300,
          },
        },
        voice: {
          voiceId: "Vivian",
          gender: "female",
          emotion: "panic",
          intensity: 0.8,
          speechRate: 1.1,
        },
        fallbackReply,
      }),
      applyCallerReply: jest.fn(),
    };
    const factory = new ScenarioVoicePipelineRequestFactory(
      engine as unknown as ScenarioEngineService,
    );

    const request = await factory.create({
      command: { type: "speak", operatorText: "Назовите адрес" },
      requestId: "request-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
    });

    expect(request.generation.fallbackReply).toEqual(fallbackReply);
    expect(request.generation.context.allowedFacts).toEqual([
      { id: "address", value: fallbackReply.text },
    ]);
  });

  it("returns generation provenance to the Scenario Engine journal", async () => {
    const engine = {
      buildGenerationContext: jest.fn(),
      applyCallerReply: jest.fn().mockResolvedValue(undefined),
    };
    const factory = new ScenarioVoicePipelineRequestFactory(
      engine as unknown as ScenarioEngineService,
    );

    await factory.recordReply({
      requestId: "request-1",
      sessionId: "session-1",
      operatorText: "Назовите адрес",
      reply: fallbackReply,
      generation,
    });

    expect(engine.applyCallerReply).toHaveBeenCalledWith(
      expect.objectContaining({ generation }),
    );
  });
});
