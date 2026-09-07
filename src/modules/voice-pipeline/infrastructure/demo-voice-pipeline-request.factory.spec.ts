import { createDemoVoicePipelineRequest } from "./demo-voice-pipeline-request.factory";

const options = {
  command: {
    type: "speak" as const,
    operatorText: "Что произошло?",
  },
  requestId: "request-1",
  sessionId: "session-1",
  signal: new AbortController().signal,
};

describe("createDemoVoicePipelineRequest", () => {
  it("builds a validated server-owned synthetic context", () => {
    const request = createDemoVoicePipelineRequest(options, true);

    expect(request).toEqual({
      generation: {
        requestId: "request-1",
        sessionId: "session-1",
        scenarioVersionId: "synthetic-fire-v1",
        operatorText: "Что произошло?",
        context: {
          persona: expect.objectContaining({
            id: "synthetic-caller-1",
            language: "Russian",
          }),
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
      },
      voiceId: "Vivian",
    });
  });

  it("uses the requested voice without accepting scenario facts", () => {
    const request = createDemoVoicePipelineRequest(
      {
        ...options,
        command: { ...options.command, voiceId: "Chelsie" },
      },
      true,
    );

    expect(request.voiceId).toBe("Chelsie");
  });

  it("rejects use unless demo mode is explicitly enabled", () => {
    expect(() => createDemoVoicePipelineRequest(options, false)).toThrow(
      "Voice pipeline demo context is disabled",
    );
  });

  it("preserves caller cancellation", () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled by caller"));

    expect(() =>
      createDemoVoicePipelineRequest(
        { ...options, signal: controller.signal },
        true,
      ),
    ).toThrow("cancelled by caller");
  });
});
