import { Channel, invoke } from "@tauri-apps/api/core";

import { API_BASE_URL, ApiRoutes } from "../config/api";


export interface AsrSession {
  sessionId: string;
  wsUrl: string;
  sampleRate: number;
  expiresInSeconds: number;
  model: string;
}

export interface AsrHealth {
  status: string;
  model: string;
  device: string;
  flashAttention: boolean;
}

export interface TranscriptEvent {
  transcript: string;
  audioMs: number;
  processingMs: number;
}

interface AsrStreamCallbacks {
  onReady?: (session: AsrSession) => void;
  onPartial?: (event: TranscriptEvent) => void;
  onFinal?: (event: TranscriptEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * События приходят из Rust в том же виде, в каком их отдаёт ASR-сервис.
 * `closed` добавлено нативной стороной: webview больше не владеет сокетом и
 * иначе не узнал бы о его закрытии.
 */
type AsrStreamEvent =
  | ({ type: "ready" } & Pick<AsrSession, "sessionId" | "sampleRate" | "model">)
  | ({ type: "partial" | "final" } & TranscriptEvent)
  | { type: "pong" }
  | { type: "error"; message: string };

function apiUrl(): string {
  return (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API ${response.status}: ${details}`);
  }
  return (await response.json()) as T;
}

export function getAsrHealth(): Promise<AsrHealth> {
  return request<AsrHealth>(ApiRoutes.asr.health);
}

async function createAsrSession(language: string): Promise<AsrSession> {
  return request<AsrSession>(ApiRoutes.asr.sessions, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language }),
  });
}

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(typeof reason === "string" ? reason : String(reason));
}

/**
 * Учебная сессия распознавания речи.
 *
 * Захват микрофона и WebSocket живут в Rust: `navigator.mediaDevices`
 * недоступен в WKWebView вне secure context, а App Transport Security
 * блокирует `ws://` на внешний хост. Здесь остаётся только создание сессии
 * через backend на localhost и обработка событий.
 */
export class AsrStream {
  private active = false;
  private stopping = false;
  private readonly callbacks: AsrStreamCallbacks;

  constructor(callbacks: AsrStreamCallbacks) {
    this.callbacks = callbacks;
  }

  async start(language: string): Promise<void> {
    if (this.active) throw new Error("ASR stream is already active");

    const session = await createAsrSession(language);
    const channel = new Channel<AsrStreamEvent>();
    channel.onmessage = (event) => this.handleEvent(event);

    try {
      // Микрофон и сокет открывает нативная сторона; ошибка приходит сюда же,
      // поэтому недоступное устройство видно сразу при старте.
      await invoke("asr_start", { wsUrl: session.wsUrl, onEvent: channel });
    } catch (reason) {
      throw toError(reason);
    }

    this.active = true;
    this.stopping = false;
    this.callbacks.onReady?.(session);
  }

  async stop(): Promise<void> {
    if (!this.active || this.stopping) return;
    this.stopping = true;
    await invoke("asr_stop");
  }

  async dispose(): Promise<void> {
    if (!this.active) return;
    this.stopping = true;
    this.active = false;
    try {
      await invoke("asr_stop");
    } catch {
      // Освобождение ресурсов не должно ломать размонтирование компонента.
    }
  }

  private handleEvent(event: AsrStreamEvent): void {
    switch (event.type) {
      case "partial":
        this.callbacks.onPartial?.(event);
        break;
      case "final":
        // После финала нативная сторона закрывает сокет сама, и следующее
        // `closed` уже не является ошибкой.
        this.stopping = true;
        this.callbacks.onFinal?.(event);
        break;
      case "error":
        this.fail(new Error(event.message));
        break;
      case "closed":
        if (!this.stopping) {
          this.callbacks.onError?.(new Error("Whisper WebSocket disconnected"));
        }
        this.active = false;
        this.stopping = false;
        break;
      default:
        break;
    }
  }

  private fail(error: Error): void {
    if (this.stopping) return;
    this.stopping = true;
    this.callbacks.onError?.(error);
    void invoke("asr_stop").catch(() => undefined);
  }
}
