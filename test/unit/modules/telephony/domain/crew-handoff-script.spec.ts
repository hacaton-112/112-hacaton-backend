import {
  CREW_SCRIPT_TIMING,
  type CrewScriptCommand,
  type CrewScriptEvent,
  type CrewScriptState,
  INITIAL_CREW_SCRIPT,
  stepCrewScript,
} from "@/modules/telephony/domain/crew-handoff-script";

const run = (
  events: readonly CrewScriptEvent[],
  from: CrewScriptState = INITIAL_CREW_SCRIPT,
) => {
  let state = from;
  const commands: CrewScriptCommand[] = [];
  for (const event of events) {
    const step = stepCrewScript(state, event);
    state = step.state;
    commands.push(...step.commands);
  }
  return { state, commands };
};

const plays = (commands: readonly CrewScriptCommand[]) =>
  commands.flatMap((command) =>
    command.type === "play" ? [command.prompt] : [],
  );

describe(stepCrewScript.name, () => {
  it("accepts only a complete validated report", () => {
    const { state, commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      { type: "report-evaluated", complete: true, missingFields: [] },
      { type: "prompt-finished" },
    ]);

    expect(plays(commands)).toEqual(["greeting", "closing"]);
    expect(commands).toContainEqual({ type: "stop-recognition" });
    expect(commands.at(-1)).toEqual({ type: "finish", result: "completed" });
    expect(state).toMatchObject({
      phase: "ended",
      acknowledgements: 1,
      reportComplete: true,
    });
  });

  it("asks deterministically for the first missing fact", () => {
    const { state, commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      {
        type: "report-evaluated",
        complete: false,
        missingFields: ["address", "victims"],
      },
      { type: "prompt-finished" },
    ]);

    expect(commands).toContainEqual({
      type: "play",
      prompt: "clarification",
      missingField: "address",
    });
    expect(commands).toContainEqual({
      type: "start-response-timer",
      ms: CREW_SCRIPT_TIMING.responseTimeoutMs,
    });
    expect(state.phase).toBe("listening");
  });

  it("does not turn arbitrary speech followed by a hangup into success", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      {
        type: "report-evaluated",
        complete: false,
        missingFields: ["address"],
      },
      { type: "caller-hung-up" },
    ]);

    expect(commands.at(-1)).toEqual({ type: "finish", result: "abandoned" });
  });

  it("explains an ASR failure and records an abandoned call", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "recognition-failed" },
      { type: "prompt-finished" },
    ]);

    expect(plays(commands)).toEqual(["greeting", "recognition-unavailable"]);
    expect(commands.at(-1)).toEqual({ type: "finish", result: "abandoned" });
  });

  it("fails an incomplete report on timeout", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      { type: "response-timeout" },
      { type: "prompt-finished" },
    ]);

    expect(plays(commands)).toEqual(["greeting", "incomplete"]);
    expect(commands.at(-1)).toEqual({ type: "finish", result: "abandoned" });
  });
});
