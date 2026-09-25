import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IncidentLocation } from "../contracts/geo";
import type {
  CallChannel,
  CallLocator,
  CallServerEvent,
  CallState,
  ScenarioSummary,
} from "../contracts/call";
import {
  clearActiveTrainingSession,
  readActiveTrainingSession,
  writeActiveTrainingSession,
} from "../lib/active-call-session";
import { callService, type CallStream } from "../services/call.service";
import { useAuthStore } from "../stores/auth.store";
import { useMapWindowStore } from "../stores/map-window.store";

/** Реплика разговора: то, что расслышал сервер, и то, что ответил заявитель. */
export interface DialogueTurn {
  id: string;
  role: "operator" | "caller";
  text: string;
}

export interface CallSnapshot {
  state: CallState;
  endedByInstructor: boolean;
  /** Учебная сессия звонка: по ней адресуется карточка и разбор. */
  trainingSessionId?: string;
  /** Готовность соединения: до неё звонок начать нельзя. */
  isConnected: boolean;
  /** Нативный голосовой транспорт есть только в Tauri до web-миграции. */
  voiceTransportAvailable: boolean;
  isRecovering: boolean;
  recoverySecondsRemaining: number;
  callerNumber?: string;
  incident?: IncidentLocation;
  isResolvingAddress: boolean;
  isMuted: boolean;
  /** Микрофон открыт, и речь уходит на распознавание. */
  isListening: boolean;
  /** Заявитель отвечает: реплика уже сгенерирована или звучит. */
  isCallerSpeaking: boolean;
  /** Уровень уже обработанного и воспроизводимого TTS, от 0 до 1. */
  callerAudioLevel: number;
  scenarioTitle?: string;
  scenarioDifficulty?: number;
  panicLevel: number;
  checklistSatisfied: number;
  checklistTotal: number;
  answerNormSeconds: number;
  dialogue: DialogueTurn[];
  /** Голосом или текстом идёт этот разговор. */
  channel: CallChannel;
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
    > & { assignmentId?: string },
    channel?: CallChannel,
  ) => void;
  /** Ход оператора в текстовом разговоре. */
  say: (text: string) => void;
  end: () => Promise<void>;
  toggleMute: () => void;
  reset: () => void;
}

/** Через сколько пробовать снова после обрыва: сокет — единственный канал. */
const RECONNECT_DELAY_MS = 2_000;
const RECOVERY_WINDOW_MS = 30_000;

const ERROR_MESSAGES: Record<string, string> = {
  "session-recovery-unavailable": "Сессию не удалось восстановить",
  "listen-failed": "Реплику не удалось распознать, повторите",
  "pipeline-failed": "Заявитель не ответил: сбой генерации или синтеза",
  "context-unavailable": "Сценарий недоступен",
  "scenario-audio-not-ready":
    "Записи для локального звонка ещё не готовы. Попросите преподавателя утвердить диалог и дождаться подготовки аудио.",
  "call-state-invalid": "Команда пришла не вовремя",
  "text-channel-only": "Разговор идёт текстом: микрофон в нём не используется",
  "invalid-message": "Сервер не понял команду",
  "assignment-unavailable": "Назначение закрыто или вам не адресовано",
  "assignment-attempts-exhausted": "Попытки по этому назначению исчерпаны",
  "assignment-attempt-active": "Предыдущая попытка ещё не завершена",
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
  const operatorId = useAuthStore((state) => state.user?.id);
  // handleEvent живёт вне рендера, поэтому читает оператора через ref.
  const operatorIdRef = useRef(operatorId);
  useEffect(() => {
    operatorIdRef.current = operatorId;
  }, [operatorId]);
  const streamRef = useRef<CallStream>(null);
  const recoveryDeadlineRef = useRef<number | null>(null);
  const [isConnected, setConnected] = useState(false);
  const [isRecovering, setRecovering] = useState(false);
  const [recoverySecondsRemaining, setRecoverySecondsRemaining] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CallState>("idle");
  const [endedByInstructor, setEndedByInstructor] = useState(false);
  const [trainingSessionId, setTrainingSessionId] = useState<string>();
  const [locator, setLocator] = useState<CallLocator | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState<string>();
  const [scenarioDifficulty, setScenarioDifficulty] = useState<number>();
  const [panicLevel, setPanicLevel] = useState(0);
  const [checklistSatisfied, setChecklistSatisfied] = useState(0);
  const [checklistTotal, setChecklistTotal] = useState(0);
  const [answerNormSeconds, setAnswerNormSeconds] = useState(240);
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [channel, setChannel] = useState<CallChannel>("voice");
  // Режим нужен и вне рендера: восстановление после обрыва идёт из эффекта.
  const channelRef = useRef<CallChannel>("voice");
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
        setChannel(event.channel);
        channelRef.current = event.channel;
        setTrainingSessionId(event.sessionId);
        setLocator(event.locator);
        setScenarioTitle(event.title);
        setPanicLevel(event.panicLevel);
        setChecklistTotal(event.checklistTotal);
        setChecklistSatisfied(event.checklistSatisfied);
        setAnswerNormSeconds(event.answerNormSeconds);
        setStartedAt(new Date());
        writeActiveTrainingSession(operatorIdRef.current, event.sessionId);
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
      case "call.resumed":
        setTrainingSessionId(event.sessionId);
        setChannel(event.channel);
        channelRef.current = event.channel;
        setState(event.stage === "offered" ? "ringing" : "active");
        setLocator(event.locator);
        setScenarioTitle(event.title);
        setPanicLevel(event.panicLevel);
        setChecklistSatisfied(event.checklistSatisfied);
        setChecklistTotal(event.checklistTotal);
        setAnswerNormSeconds(event.answerNormSeconds);
        setDialogue(event.dialogue.map((turn) => ({ ...turn, id: turnId() })));
        setStartedAt(new Date(event.offeredAt));
        setAcceptedAt(
          event.answeredAt === null ? undefined : new Date(event.answeredAt),
        );
        setConnected(true);
        setRecovering(false);
        setRecoverySecondsRemaining(0);
        setError(undefined);
        recoveryDeadlineRef.current = null;
        writeActiveTrainingSession(operatorIdRef.current, event.sessionId);
        break;
      case "call.ended":
        setState("ended");
        setEndedByInstructor(event.reason === "instructor");
        setListening(false);
        void streamRef.current?.stopCapture();
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        setRecovering(false);
        recoveryDeadlineRef.current = null;
        clearActiveTrainingSession();
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
      case "reply.done":
      case "request.cancelled":
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        break;
      case "error":
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        setListening(false);
        setError(ERROR_MESSAGES[event.code] ?? event.message);
        if (event.code === "session-recovery-unavailable") {
          setRecovering(false);
          setState("ended");
          clearActiveTrainingSession();
        }
        break;
      case "socket.error":
        setError(event.message);
        break;
      case "socket.closed":
        setConnected(false);
        setListening(false);
        setCallerSpeaking(false);
        setCallerAudioLevel(0);
        if (readActiveTrainingSession(operatorIdRef.current)) {
          recoveryDeadlineRef.current ??= Date.now() + RECOVERY_WINDOW_MS;
          setRecovering(true);
          setRecoverySecondsRemaining(
            Math.max(
              0,
              Math.ceil((recoveryDeadlineRef.current - Date.now()) / 1_000),
            ),
          );
          setError(undefined);
        }
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
    if (!token || !callService.isAvailable) return;

    const storedSessionId = readActiveTrainingSession(operatorId);
    if (storedSessionId && recoveryDeadlineRef.current === null) {
      recoveryDeadlineRef.current = Date.now() + RECOVERY_WINDOW_MS;
      setRecovering(true);
      setRecoverySecondsRemaining(RECOVERY_WINDOW_MS / 1_000);
    }

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
        const sessionId = readActiveTrainingSession(operatorId);
        if (sessionId) {
          setRecovering(true);
          // Микрофон не переоткрываем сами: слушать снова решает оператор,
          // иначе восстановление записало бы тишину как его реплику.
          return stream.resume(sessionId, false, channelRef.current);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;

        const deadline = recoveryDeadlineRef.current;
        if (deadline !== null && Date.now() >= deadline) {
          recoveryDeadlineRef.current = null;
          clearActiveTrainingSession();
          setRecovering(false);
          setState((current) => (current === "idle" ? current : "ended"));
          setError("Сессия завершена: связь не восстановлена за 30 секунд");
          return;
        }

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
  }, [token, operatorId, attempt, handleEvent]);

  useEffect(() => {
    if (!isRecovering) return;

    const tick = () => {
      const deadline = recoveryDeadlineRef.current;
      if (deadline === null) return;

      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      setRecoverySecondsRemaining(remaining);
      if (remaining === 0) {
        recoveryDeadlineRef.current = null;
        clearActiveTrainingSession();
        setRecovering(false);
        setState((current) => (current === "idle" ? current : "ended"));
        setError("Сессия завершена: связь не восстановлена за 30 секунд");
      }
    };

    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [isRecovering]);

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
      channel === "text" ||
      isMuted ||
      isListening ||
      !isConnected ||
      isRecovering ||
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
    channel,
    isMuted,
    isListening,
    isConnected,
    isRecovering,
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
    setChannel("voice");
    channelRef.current = "voice";
    setEndedByInstructor(false);
    setTrainingSessionId(undefined);
    clearActiveTrainingSession();
    recoveryDeadlineRef.current = null;
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
    setRecovering(false);
    setRecoverySecondsRemaining(0);
  }, []);

  const startScenario = useCallback(
    (
      scenario: Pick<
        ScenarioSummary,
        "scenarioVersionId" | "category" | "title" | "difficulty"
      > & { assignmentId?: string },
      requestedChannel: CallChannel = "voice",
    ) => {
      reset();
      setScenarioTitle(scenario.title);
      setScenarioDifficulty(scenario.difficulty);
      setChannel(requestedChannel);
      channelRef.current = requestedChannel;
      command((stream) =>
        stream.start(
          scenario.scenarioVersionId,
          scenario.category,
          scenario.assignmentId,
          requestedChannel,
        ),
      )();
    },
    [command, reset],
  );

  /**
   * Реплика оператора текстом.
   *
   * Она сразу попадает в ленту разговора: в голосовом режиме её возвращает
   * распознавание, а здесь её никто, кроме самого окна, не покажет.
   */
  const say = useCallback(
    (text: string) => {
      const operatorText = text.trim();
      if (!operatorText) return;

      setDialogue((turns) => [
        ...turns,
        { id: turnId(), role: "operator", text: operatorText },
      ]);
      setCallerSpeaking(true);
      command((stream) => stream.say(operatorText))();
    },
    [command],
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
    endedByInstructor,
    trainingSessionId,
    isConnected,
    voiceTransportAvailable: callService.isAvailable,
    isRecovering,
    recoverySecondsRemaining,
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
    channel,
    error,
    startedAt,
    acceptedAt,
    elapsedSeconds,
    startScenario,
    say,
    end,
    toggleMute,
    reset,
  };
}
