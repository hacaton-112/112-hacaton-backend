import {
  CREW_SCRIPT_TIMING,
  type CrewScriptCommand,
  type CrewScriptEvent,
  type CrewScriptState,
  INITIAL_CREW_SCRIPT,
  stepCrewScript,
} from "./crew-handoff-script";

/** Прогоняет события и собирает команды: так читается весь разговор. */
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
    command.type === "play" ? [`${command.prompt}#${command.index}`] : [],
  );

const phrase = (durationMs = 2_000): CrewScriptEvent[] => [
  { type: "speech-started" },
  { type: "speech-finished", durationMs },
];

describe("stepCrewScript", () => {
  it("answers, acknowledges every phrase and says goodbye after the silence", () => {
    const { state, commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(),
      { type: "prompt-finished" },
      ...phrase(),
      { type: "prompt-finished" },
      { type: "silence-elapsed" },
      { type: "prompt-finished" },
    ]);

    expect(plays(commands)).toEqual([
      "greeting#0",
      "acknowledgement#0",
      "acknowledgement#1",
      "closing#0",
    ]);
    expect(commands).toContainEqual({ type: "hang-up" });
    expect(commands.at(-1)).toEqual({ type: "finish", result: "completed" });
    expect(state).toMatchObject({ phase: "ended", acknowledgements: 2 });
  });

  it("waits longer for the first words than for the end of the report", () => {
    const greeted = run([{ type: "answered" }, { type: "prompt-finished" }]);
    const acknowledged = run(
      [...phrase(), { type: "prompt-finished" }],
      greeted.state,
    );

    expect(greeted.commands).toContainEqual({
      type: "start-silence-timer",
      ms: CREW_SCRIPT_TIMING.firstSpeechTimeoutMs,
    });
    expect(acknowledged.commands).toContainEqual({
      type: "start-silence-timer",
      ms: CREW_SCRIPT_TIMING.closingSilenceMs,
    });
  });

  it("hangs up without a word when the dispatcher never speaks", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      { type: "silence-elapsed" },
    ]);

    expect(plays(commands)).toEqual(["greeting#0"]);
    expect(commands.at(-1)).toEqual({ type: "finish", result: "abandoned" });
  });

  it("does not acknowledge a cough", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(CREW_SCRIPT_TIMING.minSpeechMs - 1),
    ]);

    expect(plays(commands)).toEqual(["greeting#0"]);
  });

  it("does not count silence while the dispatcher is still talking", () => {
    const { state, commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(),
      // Диспетчер продолжил говорить, пока наряд квитировал.
      { type: "speech-started" },
      { type: "prompt-finished" },
      { type: "silence-elapsed" },
    ]);

    expect(state.phase).toBe("listening");
    expect(plays(commands)).not.toContain("closing#0");
  });

  it("acknowledges a phrase finished while the crew was speaking", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(),
      ...phrase(),
      { type: "prompt-finished" },
    ]);

    expect(plays(commands)).toEqual([
      "greeting#0",
      "acknowledgement#0",
      "acknowledgement#1",
    ]);
  });

  it("counts a report as delivered when the dispatcher hangs up after it", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(),
      { type: "caller-hung-up" },
    ]);

    expect(commands.at(-1)).toEqual({ type: "finish", result: "completed" });
  });

  it("counts a call as abandoned when the dispatcher hangs up in silence", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "caller-hung-up" },
    ]);

    expect(commands.at(-1)).toEqual({ type: "finish", result: "abandoned" });
  });

  it("wraps up a call that runs past the limit", () => {
    const { commands } = run([
      { type: "answered" },
      { type: "prompt-finished" },
      ...phrase(),
      { type: "call-limit-reached" },
    ]);

    expect(plays(commands).at(-1)).toBe("closing#0");
  });

  it("ignores everything once the call is over", () => {
    const ended = run([{ type: "answered" }, { type: "caller-hung-up" }]);

    expect(
      stepCrewScript(ended.state, { type: "prompt-finished" }).commands,
    ).toEqual([]);
  });
});
