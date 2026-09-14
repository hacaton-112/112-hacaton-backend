import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IncidentLocation } from "../components/map/incident-map";
import type {
  CallLocator,
  CallServerEvent,
  ScenarioSummary,
} from "../contracts/call";
import { callService, type CallStream } from "../services/call.service";
import { useAuthStore } from "../stores/auth.store";
import { useMapWindowStore } from "../stores/map-window.store";

export type CallState = "idle" | "ringing" | "active" | "ended";

/** Реплика разговора: то, что расслышал сервер, и то, что ответил заявитель. */
export interface DialogueTurn {
  id: string;
  role: "operator" | "caller";
  text: string;
}

export interface CallSnapshot {
  state: CallState;
  /** Учебная сессия звонка: по ней адресуется карточка и разбор. */
  trainingSessionId?: string;
  /** Готовность соединения: до неё звонок начать нельзя. */
  isConnected: boolean;
  callerNumber?: string;
  incident?: IncidentLocation;
  isResolvingAddress: boolean;
  isMuted: boolean;
  /** Микрофон открыт, и речь уходит на распознавание. */
  isListening: boolean;
  /** Заявитель отвечает: реплика уже сгенерирована или звучит. */
  isCallerSpeaking: boolean;
  /** Уровень уже обработанного и воспроизводимого Rust TTS, от 0 до 1. */
  callerAudioLevel: number;
  scenarioTitle?: string;
  scenarioDifficulty?: number;
  panicLevel: number;
  checklistSatisfied: number;
  checklistTotal: number;
  answerNormSeconds: number;
  dialogue: DialogueTurn[];
  error?: string;
  startedAt?: Date;
  acceptedAt?: Date;
  elapsedSeconds: number;
}

export interface CallControls {
  startScenario: (
    scenario: Pick<
      ScenarioSummary,
      "scenarioVersionId" | "category" | "title" | "difficulty"
    >,
  ) => void;
  end: () => Promise<void>;
  toggleMute: () => void;
  reset: () => void;
}

/** Через сколько пробовать снова после обрыва: сокет — единственный канал. */
const RECONNECT_DELAY_MS = 2_000;

const ERROR_MESSAGES: Record<string, string> = {
  "listen-failed": "Реплику не удалось распознать, повторите",
  "pipeline-failed": "Заявитель не ответил: сбой генерации или синтеза",
  "context-unavailable": "Сценарий недоступен",
  "call-state-invalid": "Команда пришла не вовремя",
  "invalid-message": "Сервер не понял команду",
};

const toIncident = (
  locator: CallLocator | null,
): IncidentLocation | undefined =>
  locator
    ? {
        address: locator.label,
        longitude: locator.centerLon,
        latitude: locator.centerLat,
      }
    : undefined;

const turnId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Состояние вызова целиком со стороны сервера.
 *
 * Ход звонка ведёт Scenario Engine: клиент только показывает его события и
 * отправляет команды. Ничего похожего на прежнюю симуляцию здесь нет — время,
 * паника и реплики приходят из backend.
 */
export function useCall(): CallSnapshot & CallControls {
  const token = useAuthStore((state) => state.accessToken);
  const streamRef = useRef<CallStream>(null);
  const [isConnected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CallState>("idle");
  const [trainingSessionId, setTrainingSessionId] = useState<string>();
  const [locator, setLocator] = useState<CallLocator | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState<string>();
  const [scenarioDifficulty, setScenarioDifficulty] = useState<number>();
  const [panicLevel, setPanicLevel] = useState(0);
  const [checklistSatisfied, setChecklistSatisfied] = useState(0);
  const [checklistTotal, setChecklistTotal] = useState(0);
  const [answerNormSeconds, setAnswerNormSeconds] = useState(240);
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [isListening, setListening] = useState(false);
  const [hasOpenedMicrophone, setHasOpenedMicrophone] = useState(false);
  const [isCallerSpeaking, setCallerSpeaking] = useState(false);
  const [callerAudioLevel, setCallerAudioLevel] = useState(0);
  const [isMuted, setMuted] = useState(false);
  const [error, setError] = useState<string>();
  const [startedAt, setStartedAt] = useState<Date>();
  const [acceptedAt, setAcceptedAt] = useState<Date>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handleEvent = useCallback((event: CallServerEvent) => {
    switch (event.type) {
      case "call.offered":
        setState("ringing");
        setTrainingSessionId(event.sessionId);
        setLocator(event.locator);
        setScenarioTitle(event.title);
        setPanicLevel(event.panicLevel);
        setChecklistTotal(event.checklistTotal);
        setChecklistSatisfied(event.checklistSatisfied);
        setAnswerNormSeconds(event.answerNormSeconds);
        setStartedAt(new Date());
        break;
      case "call.accepted":
        setState("active");
        setAcceptedAt(new Date());
        setPanicLevel(event.panicLevel);
        setCallerSpeaking(true);
        // Первая реплика задана сценарием, а не сгенерирована.
        setDialogue([
          { id: turnId(), role: "caller", text: event.openingLine },
        ]);
        break;
      case "call.state":
        setPanicLevel(event.panicLevel);
        setChecklistSatisfied(event.checklistSatisfied);
        setChecklistTotal(event.checklistTotal);
        break;
      case "call.ended":
        setState("ended");
        setListening(false);
        void streamRef.current?.stopCapture();
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        break;
      case "listen.started":
        setListening(true);
        setHasOpenedMicrophone(true);
        setError(undefined);
        break;
      case "listen.transcript":
        if (event.transcript.trim().length > 0) {
          setDialogue((turns) => [
            ...turns,
            { id: turnId(), role: "operator", text: event.transcript },
          ]);
        }
        break;
      case "listen.stopped":
        setListening(false);
        if (event.transcript.trim().length > 0) {
          setDialogue((turns) => [
            ...turns,
            { id: turnId(), role: "operator", text: event.transcript },
          ]);
        }
        break;
      case "reply.text":
        setDialogue((turns) => [
          ...turns,
          { id: turnId(), role: "caller", text: event.text },
        ]);
        setCallerSpeaking(true);
        break;
      case "audio.start":
        setCallerSpeaking(true);
        setCallerAudioLevel(0);
        break;
      case "audio.level":
        setCallerSpeaking(true);
        setCallerAudioLevel(event.level);
        break;
      case "audio.done":
      case "request.cancelled":
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        break;
      case "error":
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        setListening(false);
        setError(ERROR_MESSAGES[event.code] ?? event.message);
        break;
      case "socket.error":
        setError(event.message);
        break;
      case "socket.closed":
        setConnected(false);
        // Звонок жил в этом соединении и вместе с ним закончился: у нового
        // соединения будет своя учебная сессия. Оставить окно в разговоре
        // значило бы показывать вызов, который уже никто не примет.
        setState((current) => (current === "idle" ? current : "ended"));
        setListening(false);
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        setError("Соединение с сервером потеряно, переподключаюсь…");
        window.setTimeout(
          () => setAttempt((value) => value + 1),
          RECONNECT_DELAY_MS,
        );
        break;
      default:
        break;
    }
  }, []);

  // Соединение живёт столько же, сколько рабочее место оператора: звонки
  // сменяют друг друга внутри него.
  useEffect(() => {
    if (!token) return;

    // React в режиме разработки монтирует эффект дважды, и второе соединение
    // вытесняет первое. Без этого флага отказ вытесненной попытки выглядел бы
    // как обрыв связи и запускал переподключение, которое вытесняло бы уже
    // живое соединение — вместе с идущим по нему звонком.
    let cancelled = false;
    const stream = callService.createStream({
      onEvent: (event) => {
        if (!cancelled) {
          handleEvent(event);
        }
      },
    });
    streamRef.current = stream;

    stream
      .connect(token)
      .then(() => {
        if (cancelled) return;

        setConnected(true);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;

        setError(reason instanceof Error ? reason.message : String(reason));
        window.setTimeout(
          () => setAttempt((value) => value + 1),
          RECONNECT_DELAY_MS,
        );
      });

    return () => {
      cancelled = true;
      streamRef.current = null;
      setConnected(false);
      void stream.dispose();
    };
  }, [token, attempt, handleEvent]);

  useEffect(() => {
    if (state !== "active" || !acceptedAt) return;

    const tick = () =>
      setElapsedSeconds(
        Math.floor((Date.now() - acceptedAt.getTime()) / 1_000),
      );

    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [state, acceptedAt]);

  const incident = useMemo(() => toIncident(locator), [locator]);

  useEffect(() => {
    useMapWindowStore.getState().setSnapshot({
      callState: state,
      incident: incident ?? null,
      isResolvingAddress: state !== "idle" && !incident,
    });
  }, [state, incident]);

  const runCommand = useCallback(
    async (run: (stream: CallStream) => Promise<void>) => {
      const stream = streamRef.current;
      if (!stream) {
        const reason = new Error("Нет соединения с сервером звонка");
        setError(reason.message);
        throw reason;
      }

      try {
        await run(stream);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        throw reason;
      }
    },
    [],
  );

  const acceptingRef = useRef(false);
  useEffect(() => {
    if (state !== "ringing" || acceptingRef.current) return;

    acceptingRef.current = true;
    void runCommand((stream) => stream.accept())
      .catch(() => undefined)
      .finally(() => {
        acceptingRef.current = false;
      });
  }, [state, runCommand]);

  const startingMicrophoneRef = useRef(false);
  useEffect(() => {
    if (
      state !== "active" ||
      isMuted ||
      isListening ||
      startingMicrophoneRef.current ||
      (!hasOpenedMicrophone && isCallerSpeaking)
    ) {
      return;
    }

    startingMicrophoneRef.current = true;
    void runCommand((stream) => stream.holdFloor())
      .catch(() => undefined)
      .finally(() => {
        startingMicrophoneRef.current = false;
      });
  }, [
    state,
    isMuted,
    isListening,
    hasOpenedMicrophone,
    isCallerSpeaking,
    runCommand,
  ]);

  const command = useCallback(
    (run: (stream: CallStream) => Promise<void>) => () => {
      void runCommand(run).catch(() => undefined);
    },
    [runCommand],
  );

  const reset = useCallback(() => {
    setState("idle");
    setTrainingSessionId(undefined);
    setLocator(null);
    setScenarioTitle(undefined);
    setScenarioDifficulty(undefined);
    setPanicLevel(0);
    setChecklistSatisfied(0);
    setChecklistTotal(0);
    setDialogue([]);
    setListening(false);
    setHasOpenedMicrophone(false);
    setCallerSpeaking(false);
    setCallerAudioLevel(0);
    setMuted(false);
    setError(undefined);
    setStartedAt(undefined);
    setAcceptedAt(undefined);
    setElapsedSeconds(0);
  }, []);

  const startScenario = useCallback(
    (
      scenario: Pick<
        ScenarioSummary,
        "scenarioVersionId" | "category" | "title" | "difficulty"
      >,
    ) => {
      reset();
      setScenarioTitle(scenario.title);
      setScenarioDifficulty(scenario.difficulty);
      command((stream) =>
        stream.start(scenario.scenarioVersionId, scenario.category),
      )();
    },
    [command, reset],
  );

  const end = useCallback(
    () =>
      runCommand(async (stream) => {
        if (isListening) await stream.releaseFloor();
        await stream.end();
      }),
    [isListening, runCommand],
  );

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (next && isListening) {
        command((stream) => stream.releaseFloor())();
      }
      return next;
    });
  }, [command, isListening]);

  return {
    state,
    trainingSessionId,
    isConnected,
    callerNumber: locator?.callerNumber,
    incident,
    isResolvingAddress: state !== "idle" && !incident,
    isMuted,
    isListening,
    isCallerSpeaking,
    callerAudioLevel,
    scenarioTitle,
    scenarioDifficulty,
    panicLevel,
    checklistSatisfied,
    checklistTotal,
    answerNormSeconds,
    dialogue,
    error,
    startedAt,
    acceptedAt,
    elapsedSeconds,
    startScenario,
    end,
    toggleMute,
    reset,
  };
}
