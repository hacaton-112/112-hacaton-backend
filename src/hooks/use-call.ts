import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IncidentLocation } from "../components/map/incident-map";
import type { CallLocator, CallServerEvent } from "../contracts/call";
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
  /** Готовность соединения: до неё звонок начать нельзя. */
  isConnected: boolean;
  callerNumber?: string;
  incident?: IncidentLocation;
  isResolvingAddress: boolean;
  isOnHold: boolean;
  isMuted: boolean;
  /** Микрофон открыт, и речь уходит на распознавание. */
  isListening: boolean;
  /** Заявитель отвечает: реплика уже сгенерирована или звучит. */
  isCallerSpeaking: boolean;
  scenarioTitle?: string;
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
  startScenario: (scenarioVersionId: string) => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
  holdFloor: () => void;
  releaseFloor: () => void;
  toggleHold: () => void;
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
  const [locator, setLocator] = useState<CallLocator | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState<string>();
  const [panicLevel, setPanicLevel] = useState(0);
  const [checklistSatisfied, setChecklistSatisfied] = useState(0);
  const [checklistTotal, setChecklistTotal] = useState(0);
  const [answerNormSeconds, setAnswerNormSeconds] = useState(240);
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [isListening, setListening] = useState(false);
  const [isCallerSpeaking, setCallerSpeaking] = useState(false);
  const [isOnHold, setOnHold] = useState(false);
  const [isMuted, setMuted] = useState(false);
  const [error, setError] = useState<string>();
  const [startedAt, setStartedAt] = useState<Date>();
  const [acceptedAt, setAcceptedAt] = useState<Date>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handleEvent = useCallback((event: CallServerEvent) => {
    switch (event.type) {
      case "call.offered":
        setState("ringing");
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
        setCallerSpeaking(false);
        break;
      case "listen.started":
        setListening(true);
        setError(undefined);
        break;
      case "listen.stopped":
        setListening(false);
        if (event.transcript.trim().length > 0) {
          setDialogue((turns) => [
            ...turns,
            { id: turnId(), role: "operator", text: event.transcript },
          ]);
          setCallerSpeaking(true);
        }
        break;
      case "reply.text":
        setDialogue((turns) => [
          ...turns,
          { id: turnId(), role: "caller", text: event.text },
        ]);
        break;
      case "audio.done":
      case "request.cancelled":
        setCallerSpeaking(false);
        break;
      case "error":
        setCallerSpeaking(false);
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

  const command = useCallback(
    (run: (stream: CallStream) => Promise<void>) => () => {
      const stream = streamRef.current;
      if (!stream) return;

      run(stream).catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setState("idle");
    setLocator(null);
    setScenarioTitle(undefined);
    setPanicLevel(0);
    setChecklistSatisfied(0);
    setChecklistTotal(0);
    setDialogue([]);
    setListening(false);
    setCallerSpeaking(false);
    setOnHold(false);
    setMuted(false);
    setError(undefined);
    setStartedAt(undefined);
    setAcceptedAt(undefined);
    setElapsedSeconds(0);
  }, []);

  const startScenario = useCallback(
    (scenarioVersionId: string) => {
      reset();
      command((stream) => stream.start(scenarioVersionId))();
    },
    [command, reset],
  );

  return {
    state,
    isConnected,
    callerNumber: locator?.callerNumber,
    incident,
    isResolvingAddress: state !== "idle" && !incident,
    isOnHold,
    isMuted,
    isListening,
    isCallerSpeaking,
    scenarioTitle,
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
    accept: command((stream) => stream.accept()),
    reject: command((stream) => stream.decline()),
    end: command((stream) => stream.end()),
    holdFloor: command((stream) => stream.holdFloor()),
    releaseFloor: command((stream) => stream.releaseFloor()),
    toggleHold: () => setOnHold((value) => !value),
    toggleMute: () => setMuted((value) => !value),
    reset,
  };
}
