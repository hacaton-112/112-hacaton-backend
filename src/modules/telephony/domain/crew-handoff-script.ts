/**
 * Как наряд ведёт разговор с диспетчером ДДС.
 *
 * Наряд не понимает смысла сказанного — он квитирует: здоровается, после
 * каждой законченной фразы диспетчера подтверждает приём, а когда диспетчер
 * замолчал надолго, говорит «принято» и кладёт трубку. Этого хватает, чтобы
 * отработать саму передачу карточки по телефону, и не нужно ни модели, ни
 * распознавания речи.
 *
 * Автомат чистый: на вход событие звонка, на выход команды для телефонии.
 * Таймеры, воспроизведение и Asterisk живут снаружи, поэтому ход разговора
 * проверяется тестами без АТС.
 */

export const CREW_SCRIPT_TIMING = {
  /** Короче — это кашель или «э-э», а не фраза, которую нужно квитировать. */
  minSpeechMs: 600,
  /** Столько тишины после квитанции означает, что диспетчер закончил. */
  closingSilenceMs: 4_000,
  /** Столько тишины после приветствия — диспетчер так и не заговорил. */
  firstSpeechTimeoutMs: 15_000,
  /** Разговор с нарядом длиннее не бывает: дальше наряд прощается сам. */
  maxCallMs: 180_000,
  /**
   * Самая длинная фраза, после которой наряд квитирует, не дожидаясь конца.
   *
   * Детектор речи Asterisk узнаёт о тишине по аудиокадрам. Телефон с
   * подавлением тишины в паузе кадров не шлёт, и конец фразы не наступает
   * никогда — без этого предела наряд молчал бы до конца разговора.
   */
  maxPhraseMs: 15_000,
} as const;

export type CrewPrompt = "greeting" | "acknowledgement" | "closing";

export type CrewCallResult = "completed" | "abandoned";

export type CrewScriptEvent =
  | { readonly type: "answered" }
  | { readonly type: "prompt-finished" }
  | { readonly type: "speech-started" }
  | { readonly type: "speech-finished"; readonly durationMs: number }
  | { readonly type: "silence-elapsed" }
  | { readonly type: "call-limit-reached" }
  | { readonly type: "caller-hung-up" };

export type CrewScriptCommand =
  | {
      readonly type: "play";
      readonly prompt: CrewPrompt;
      /** Номер квитанции: наряд не повторяет одно и то же слово подряд. */
      readonly index: number;
    }
  | { readonly type: "start-silence-timer"; readonly ms: number }
  | { readonly type: "stop-silence-timer" }
  | { readonly type: "hang-up" }
  | { readonly type: "finish"; readonly result: CrewCallResult };

export interface CrewScriptState {
  readonly phase:
    | "ringing"
    | "greeting"
    | "listening"
    | "acknowledging"
    | "closing"
    | "ended";
  readonly acknowledgements: number;
  /** Диспетчер сейчас говорит. */
  readonly speaking: boolean;
  /** Диспетчер договорил фразу, пока наряд ещё говорил сам. */
  readonly unacknowledgedSpeech: boolean;
}

export const INITIAL_CREW_SCRIPT: CrewScriptState = {
  phase: "ringing",
  acknowledgements: 0,
  speaking: false,
  unacknowledgedSpeech: false,
};

export interface CrewScriptStep {
  readonly state: CrewScriptState;
  readonly commands: readonly CrewScriptCommand[];
}

const acknowledge = (state: CrewScriptState): CrewScriptStep => ({
  state: {
    ...state,
    phase: "acknowledging",
    acknowledgements: state.acknowledgements + 1,
    unacknowledgedSpeech: false,
  },
  commands: [
    { type: "stop-silence-timer" },
    { type: "play", prompt: "acknowledgement", index: state.acknowledgements },
  ],
});

/** Диспетчер закончил — наряд прощается; если так и не заговорил — отбой. */
const wrapUp = (state: CrewScriptState): CrewScriptStep =>
  state.acknowledgements > 0
    ? {
        state: { ...state, phase: "closing" },
        commands: [
          { type: "stop-silence-timer" },
          { type: "play", prompt: "closing", index: 0 },
        ],
      }
    : {
        state: { ...state, phase: "ended" },
        commands: [
          { type: "stop-silence-timer" },
          { type: "hang-up" },
          { type: "finish", result: "abandoned" },
        ],
      };

const listen = (state: CrewScriptState): CrewScriptStep => ({
  state: { ...state, phase: "listening" },
  // Пока диспетчер говорит, тишину не отсчитываем: он ещё не закончил.
  commands: state.speaking
    ? []
    : [
        {
          type: "start-silence-timer",
          ms:
            state.acknowledgements > 0
              ? CREW_SCRIPT_TIMING.closingSilenceMs
              : CREW_SCRIPT_TIMING.firstSpeechTimeoutMs,
        },
      ],
});

const unchanged = (state: CrewScriptState): CrewScriptStep => ({
  state,
  commands: [],
});

export function stepCrewScript(
  state: CrewScriptState,
  event: CrewScriptEvent,
): CrewScriptStep {
  if (state.phase === "ended") return unchanged(state);

  if (event.type === "caller-hung-up") {
    return {
      state: { ...state, phase: "ended", speaking: false },
      commands: [
        { type: "stop-silence-timer" },
        {
          type: "finish",
          result: state.acknowledgements > 0 ? "completed" : "abandoned",
        },
      ],
    };
  }

  if (event.type === "call-limit-reached") {
    return state.phase === "closing" ? unchanged(state) : wrapUp(state);
  }

  switch (state.phase) {
    case "ringing":
      return event.type === "answered"
        ? {
            state: { ...state, phase: "greeting" },
            commands: [{ type: "play", prompt: "greeting", index: 0 }],
          }
        : unchanged(state);

    case "greeting":
    case "acknowledging":
      switch (event.type) {
        case "speech-started":
          return unchanged({ ...state, speaking: true });
        case "speech-finished":
          return unchanged({
            ...state,
            speaking: false,
            unacknowledgedSpeech:
              state.unacknowledgedSpeech ||
              event.durationMs >= CREW_SCRIPT_TIMING.minSpeechMs,
          });
        case "prompt-finished":
          return state.unacknowledgedSpeech
            ? acknowledge(state)
            : listen(state);
        default:
          return unchanged(state);
      }

    case "listening":
      switch (event.type) {
        case "speech-started":
          return {
            state: { ...state, speaking: true },
            commands: [{ type: "stop-silence-timer" }],
          };
        case "speech-finished":
          return event.durationMs >= CREW_SCRIPT_TIMING.minSpeechMs
            ? acknowledge({ ...state, speaking: false })
            : listen({ ...state, speaking: false });
        case "silence-elapsed":
          return state.speaking ? unchanged(state) : wrapUp(state);
        default:
          return unchanged(state);
      }

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
  }
}
