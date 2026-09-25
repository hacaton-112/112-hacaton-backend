import type { CrewHandoffField } from "./crew-handoff-validation";

/**
 * Чистый автомат разговора с виртуальным нарядом.
 *
 * Содержание речи проверяется до передачи события `report-evaluated`. Автомат
 * отвечает только за порядок реплик и гарантирует, что успешный отбой
 * невозможен без полного отчёта.
 */

export const CREW_SCRIPT_TIMING = {
  /** Сколько наряд ждёт первую или уточняющую реплику. */
  responseTimeoutMs: 20_000,
  /** Абсолютный предел разговора, включая уточнения. */
  maxCallMs: 180_000,
} as const;

export type CrewPrompt =
  | "greeting"
  | "clarification"
  | "closing"
  | "incomplete"
  | "recognition-unavailable";

export type CrewCallResult = "completed" | "abandoned";

export type CrewScriptEvent =
  | { readonly type: "answered" }
  | { readonly type: "prompt-finished" }
  | {
      readonly type: "report-evaluated";
      readonly complete: boolean;
      readonly missingFields: readonly CrewHandoffField[];
    }
  | { readonly type: "response-timeout" }
  | { readonly type: "call-limit-reached" }
  | { readonly type: "recognition-failed" }
  | { readonly type: "caller-hung-up" };

export type CrewScriptCommand =
  | {
      readonly type: "play";
      readonly prompt: CrewPrompt;
      readonly missingField?: CrewHandoffField;
    }
  | { readonly type: "start-response-timer"; readonly ms: number }
  | { readonly type: "stop-response-timer" }
  | { readonly type: "stop-recognition" }
  | { readonly type: "hang-up" }
  | { readonly type: "finish"; readonly result: CrewCallResult };

export interface CrewScriptState {
  readonly phase:
    | "ringing"
    | "greeting"
    | "listening"
    | "clarifying"
    | "closing"
    | "failing"
    | "ended";
  /** Число непустых ASR-финалов, а не число любых звуков на линии. */
  readonly acknowledgements: number;
  readonly reportComplete: boolean;
}

export const INITIAL_CREW_SCRIPT: CrewScriptState = {
  phase: "ringing",
  acknowledgements: 0,
  reportComplete: false,
};

export interface CrewScriptStep {
  readonly state: CrewScriptState;
  readonly commands: readonly CrewScriptCommand[];
}

const unchanged = (state: CrewScriptState): CrewScriptStep => ({
  state,
  commands: [],
});

const fail = (
  state: CrewScriptState,
  prompt: "incomplete" | "recognition-unavailable",
): CrewScriptStep => ({
  state: { ...state, phase: "failing" },
  commands: [
    { type: "stop-response-timer" },
    { type: "stop-recognition" },
    { type: "play", prompt },
  ],
});

const listen = (state: CrewScriptState): CrewScriptStep => ({
  state: { ...state, phase: "listening" },
  commands: [
    {
      type: "start-response-timer",
      ms: CREW_SCRIPT_TIMING.responseTimeoutMs,
    },
  ],
});

export function stepCrewScript(
  state: CrewScriptState,
  event: CrewScriptEvent,
): CrewScriptStep {
  if (state.phase === "ended") return unchanged(state);

  if (event.type === "caller-hung-up") {
    return {
      state: { ...state, phase: "ended" },
      commands: [
        { type: "stop-response-timer" },
        { type: "stop-recognition" },
        {
          type: "finish",
          result: state.reportComplete ? "completed" : "abandoned",
        },
      ],
    };
  }

  if (event.type === "recognition-failed") {
    return state.phase === "closing"
      ? unchanged(state)
      : fail(state, "recognition-unavailable");
  }

  if (
    event.type === "response-timeout" ||
    event.type === "call-limit-reached"
  ) {
    return state.phase === "closing" || state.phase === "failing"
      ? unchanged(state)
      : fail(state, "incomplete");
  }

  if (event.type === "report-evaluated") {
    if (!["greeting", "listening", "clarifying"].includes(state.phase)) {
      return unchanged(state);
    }

    const next = {
      ...state,
      acknowledgements: state.acknowledgements + 1,
      reportComplete: event.complete,
    };

    if (event.complete) {
      return {
        state: { ...next, phase: "closing" },
        commands: [
          { type: "stop-response-timer" },
          { type: "stop-recognition" },
          { type: "play", prompt: "closing" },
        ],
      };
    }

    return {
      state: { ...next, phase: "clarifying" },
      commands: [
        { type: "stop-response-timer" },
        {
          type: "play",
          prompt: "clarification",
          missingField: event.missingFields[0] ?? "description",
        },
      ],
    };
  }

  switch (state.phase) {
    case "ringing":
      return event.type === "answered"
        ? {
            state: { ...state, phase: "greeting" },
            commands: [{ type: "play", prompt: "greeting" }],
          }
        : unchanged(state);

    case "greeting":
    case "clarifying":
      return event.type === "prompt-finished"
        ? listen(state)
        : unchanged(state);

    case "closing":
      return event.type === "prompt-finished"
        ? {
            state: { ...state, phase: "ended" },
            commands: [
              { type: "hang-up" },
              { type: "finish", result: "completed" },
            ],
          }
        : unchanged(state);

    case "failing":
      return event.type === "prompt-finished"
        ? {
            state: { ...state, phase: "ended" },
            commands: [
              { type: "hang-up" },
              { type: "finish", result: "abandoned" },
            ],
          }
        : unchanged(state);

    case "listening":
      return unchanged(state);
  }
}
