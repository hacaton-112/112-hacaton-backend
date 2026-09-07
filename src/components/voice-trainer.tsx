import { useEffect, useRef, useState } from "react";

import {
  AsrStream,
  getAsrHealth,
  type AsrHealth,
  type TranscriptEvent,
} from "../services/asr-stream.service";
import {
  VoicePipelineStream,
  type ReplySource,
} from "../services/voice-pipeline.service";

type RecognitionState = "idle" | "connecting" | "listening" | "processing";
type CallerReplyState = "idle" | "generating" | "speaking" | "done";

const statusLabels: Record<RecognitionState, string> = {
  idle: "Готов к записи",
  connecting: "Подключаюсь к ASR…",
  listening: "Слушаю и распознаю…",
  processing: "Формирую итоговый текст…",
};

const callerReplyLabels: Record<CallerReplyState, string> = {
  idle: "",
  generating: "Заявитель формулирует ответ…",
  speaking: "Заявитель отвечает…",
  done: "Ответ заявителя",
};

const languages = [
  { code: "ru", name: "Русский" },
  { code: "az", name: "Азербайджанский" },
  { code: "en", name: "English" },
  { code: "tr", name: "Türkçe" },
  { code: "auto", name: "Определить автоматически" },
];

interface PerformanceReport {
  recordingMs: number;
  processingMs: number;
  realtimeFactor: number;
  audioSpeed: number;
  words: number;
  characters: number;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} мс`;
  return `${(milliseconds / 1_000).toFixed(2)} с`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function VoiceTrainer() {
  const streamRef = useRef<AsrStream | undefined>(undefined);
  const voicePipelineRef = useRef<VoicePipelineStream | undefined>(undefined);
  const recordingStartedAtRef = useRef(0);
  const [recognitionState, setRecognitionState] =
    useState<RecognitionState>("idle");
  const [language, setLanguage] = useState("ru");
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [health, setHealth] = useState<AsrHealth>();
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [performanceReport, setPerformanceReport] =
    useState<PerformanceReport>();
  const [callerReplyState, setCallerReplyState] =
    useState<CallerReplyState>("idle");
  const [callerReplyText, setCallerReplyText] = useState("");
  const [callerReplySource, setCallerReplySource] = useState<ReplySource>();

  useEffect(() => {
    void getAsrHealth()
      .then(setHealth)
      .catch((reason) => setError(`ASR недоступен: ${errorMessage(reason)}`));
    return () => {
      void streamRef.current?.dispose();
      voicePipelineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (recognitionState !== "listening") return;
    const timer = window.setInterval(() => {
      setSeconds(
        Math.max(
          0,
          Math.floor(
            (performance.now() - recordingStartedAtRef.current) / 1_000,
          ),
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [recognitionState]);

  const handleFinal = (event: TranscriptEvent) => {
    const text = event.transcript.trim();
    const words = text ? text.split(/\s+/u).length : 0;
    setTranscript(text);
    setPartialTranscript("");
    setPerformanceReport({
      recordingMs: event.audioMs,
      processingMs: event.processingMs,
      realtimeFactor:
        event.audioMs > 0 ? event.processingMs / event.audioMs : 0,
      audioSpeed:
        event.processingMs > 0 ? event.audioMs / event.processingMs : 0,
      words,
      characters: text.length,
    });
    setRecognitionState("idle");
    streamRef.current = undefined;

    if (text) void speakToCaller(text);
  };

  // Как только ASR отдал финальный текст — сразу шлём его в voice-pipeline
  // (LLM-заглушка -> vLLM Omni), звук начинает проигрываться по мере
  // поступления PCM-чанков, не дожидаясь полного ответа.
  const speakToCaller = async (operatorText: string) => {
    voicePipelineRef.current?.dispose();
    setCallerReplyState("generating");
    setCallerReplyText("");
    setCallerReplySource(undefined);

    const stream = new VoicePipelineStream({
      onReplyText: (text, source) => {
        setCallerReplyText(text);
        setCallerReplySource(source);
      },
      onAudioStart: () => setCallerReplyState("speaking"),
      onAudioDone: () => setCallerReplyState("done"),
      onError: (reason) => {
        setError(`Voice pipeline: ${reason.message}`);
        setCallerReplyState("idle");
      },
    });
    voicePipelineRef.current = stream;

    try {
      await stream.connect();
      stream.speak(operatorText);
    } catch (reason) {
      setError(errorMessage(reason));
      setCallerReplyState("idle");
    }
  };

  const handleStreamError = (reason: Error) => {
    setError(reason.message);
    setRecognitionState("idle");
  };

  const handleStart = async () => {
    setError("");
    setTranscript("");
    setPartialTranscript("");
    setPerformanceReport(undefined);
    setSeconds(0);
    setRecognitionState("connecting");

    const stream = new AsrStream({
      onReady: () => {
        recordingStartedAtRef.current = performance.now();
        setRecognitionState("listening");
      },
      onPartial: (event) => setPartialTranscript(event.transcript.trim()),
      onFinal: handleFinal,
      onError: handleStreamError,
    });
    streamRef.current = stream;

    try {
      await stream.start(language);
    } catch (reason) {
      await stream.dispose();
      streamRef.current = undefined;
      setError(errorMessage(reason));
      setRecognitionState("idle");
    }
  };

  const handleStop = async () => {
    setRecognitionState("processing");
    try {
      await streamRef.current?.stop();
    } catch (reason) {
      handleStreamError(
        reason instanceof Error ? reason : new Error(errorMessage(reason)),
      );
    }
  };

  const shownTranscript = partialTranscript || transcript;
  const isBusy =
    recognitionState === "connecting" || recognitionState === "processing";

  return (
    <main className="app-shell">
      <section className="stt-card">
        <header className="hero">
          <div className="eyebrow">AXUM · CUDA · WHISPER STREAM</div>
          <h1>Потоковое распознавание речи</h1>
          <p>
            Аудио передаётся напрямую в ASR-микросервис. Частичный текст
            обновляется во время разговора, финальный приходит после остановки.
          </p>
        </header>

        <div className="status-row" aria-live="polite">
          <span className={`status-dot ${recognitionState}`} />
          <strong>{statusLabels[recognitionState]}</strong>
          {recognitionState === "listening" && (
            <span className="timer">
              {Math.floor(seconds / 60)
                .toString()
                .padStart(2, "0")}
              :{(seconds % 60).toString().padStart(2, "0")}
            </span>
          )}
          {health && (
            <span className="status-detail">
              {health.model} · {health.device}
            </span>
          )}
        </div>

        <section className="settings" aria-label="Настройки распознавания">
          <label>
            <span>Язык речи</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={recognitionState !== "idle"}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className="setup-panel">
            <div>
              <strong>{health ? "ASR подключён" : "ASR не подключён"}</strong>
              <p>
                {health
                  ? `${health.device} · Flash Attention ${health.flashAttention ? "ON" : "OFF"}`
                  : "Запусти Nest и Axum сервисы"}
              </p>
            </div>
          </div>
        </section>

        <section className="transcript" aria-live="polite">
          <div className="transcript-heading">
            <span>
              {partialTranscript ? "Промежуточный текст" : "Результат"}
            </span>
            {partialTranscript && <small>обновляется потоком</small>}
          </div>
          {shownTranscript ? (
            <div className="spoken-text">{shownTranscript}</div>
          ) : (
            <div className="placeholder">Здесь появится распознанная речь</div>
          )}
        </section>

        {callerReplyState !== "idle" && (
          <section className="transcript caller-reply" aria-live="polite">
            <div className="transcript-heading">
              <span>{callerReplyLabels[callerReplyState]}</span>
              {callerReplySource === "fallback" && (
                <small>резервный ответ</small>
              )}
            </div>
            {callerReplyText ? (
              <div className="spoken-text">{callerReplyText}</div>
            ) : (
              <div className="placeholder">Заявитель ещё думает…</div>
            )}
          </section>
        )}

        {performanceReport && (
          <section className="performance-report">
            <div className="report-header">
              <div>
                <div className="report-kicker">ASR PERFORMANCE</div>
                <h2>Отчёт распознавания</h2>
              </div>
              <span
                className={`speed-badge ${performanceReport.audioSpeed >= 1 ? "fast" : "slow"}`}
              >
                {performanceReport.audioSpeed >= 1
                  ? "Быстрее realtime"
                  : "Медленнее realtime"}
              </span>
            </div>
            <div className="metrics-grid">
              <div className="metric primary-metric">
                <span>Скорость</span>
                <strong>{performanceReport.audioSpeed.toFixed(2)}×</strong>
                <small>длина аудио / обработка</small>
              </div>
              <div className="metric">
                <span>Обработка</span>
                <strong>
                  {formatDuration(performanceReport.processingMs)}
                </strong>
                <small>финальный проход</small>
              </div>
              <div className="metric">
                <span>Запись</span>
                <strong>{formatDuration(performanceReport.recordingMs)}</strong>
                <small>отправлено в ASR</small>
              </div>
              <div className="metric">
                <span>Realtime factor</span>
                <strong>{performanceReport.realtimeFactor.toFixed(3)}</strong>
                <small>меньше — лучше</small>
              </div>
              <div className="metric">
                <span>Слова</span>
                <strong>{performanceReport.words}</strong>
                <small>в результате</small>
              </div>
              <div className="metric">
                <span>Символы</span>
                <strong>{performanceReport.characters}</strong>
                <small>с пробелами</small>
              </div>
            </div>
          </section>
        )}

        <div className="controls">
          {recognitionState === "listening" ? (
            <button
              className="record-button stop"
              onClick={() => void handleStop()}
            >
              <span className="stop-icon" />
              Остановить и получить итог
            </button>
          ) : (
            <button
              className="record-button"
              onClick={() => void handleStart()}
              disabled={isBusy}
            >
              <span className="mic-icon" />
              {recognitionState === "connecting"
                ? "Подключение…"
                : "Начать запись"}
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
