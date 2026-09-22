import { API_CONFIG } from "../config/api";
import {
  CallServerEventSchema,
  type CallClientCommand,
  type CallServerEvent,
} from "../contracts/call";
import { DeferredEvent, PendingPcmBuffer } from "../lib/audio-processing";
import { TelephonePlayer, WebMicrophoneCapture } from "../lib/web-audio";
import { settingsService } from "./settings.service";

let microphoneLevel = 0;
const microphoneLevelListeners = new Set<(level: number) => void>();
const setMicrophoneLevel = (level: number) => {
  microphoneLevel = level;
  microphoneLevelListeners.forEach((listener) => listener(level));
};
export const microphoneLevelStore = {
  get: () => microphoneLevel,
  subscribe(listener: (level: number) => void): () => void {
    microphoneLevelListeners.add(listener);
    return () => microphoneLevelListeners.delete(listener);
  },
};

interface CallStreamCallbacks {
  onEvent: (event: CallServerEvent) => void;
  onUnknownEvent?: (payload: unknown) => void;
}
export interface CallStream {
  connect(token: string): Promise<void>;
  resume(sessionId: string, resumeListening: boolean): Promise<void>;
  start(
    scenarioVersionId: string,
    scenarioCategory: string,
    assignmentId?: string,
  ): Promise<void>;
  accept(): Promise<void>;
  decline(): Promise<void>;
  end(): Promise<void>;
  holdFloor(): Promise<void>;
  releaseFloor(): Promise<void>;
  stopCapture(): Promise<void>;
  dispose(): Promise<void>;
}

let latestConnection = 0;
let activeStream: WebCallStream | null = null;
const setActiveStream = (stream: WebCallStream | null) => {
  activeStream = stream;
};

/** Браузерный транспорт сохраняет существующий wire-протокол звонка. */
class WebCallStream implements CallStream {
  private readonly callbacks: CallStreamCallbacks;
  private socket: WebSocket | null = null;
  private readonly microphone = new WebMicrophoneCapture();
  private readonly player = new TelephonePlayer();
  private readonly pending = new PendingPcmBuffer();
  private readonly deferredDone = new DeferredEvent<unknown>();
  private listening = false;
  private disposed = false;
  private generation = 0;
  private floorQueue: Promise<void> = Promise.resolve();
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly unsubscribeSettings: () => void;

  constructor(callbacks: CallStreamCallbacks) {
    this.callbacks = callbacks;
    this.unsubscribeSettings = settingsService.subscribe(() => {
      const settings = settingsService.get();
      this.microphone.setInputGain(settings.inputGain);
      this.player.setVolume(settings.outputVolume);
    });
    this.player.onLevel = (level) =>
      this.handleEvent({ type: "audio.level", level });
    this.player.onDrained = (generation) => {
      const event = this.deferredDone.take(generation);
      if (event !== null) this.handleEvent(event);
    };
  }

  async connect(token: string): Promise<void> {
    const connection = ++latestConnection;
    if (activeStream && activeStream !== this) await activeStream.dispose();
    setActiveStream(this);
    const socket = new WebSocket(API_CONFIG.getVoicePipelineStreamUrl(), [
      "bearer",
      token,
    ]);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => {
          if (connection !== latestConnection || this.disposed) {
            socket.close();
            reject(new Error("Соединение заменено новым"));
          } else resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => reject(new Error("Не удалось подключиться к звонку")),
        { once: true },
      );
    });
    socket.addEventListener("message", (event) => {
      this.messageQueue = this.messageQueue
        .then(() => this.onMessage(event.data))
        .catch((reason: unknown) => {
          this.handleEvent({
            type: "error",
            code: "audio-error",
            message: reason instanceof Error ? reason.message : String(reason),
          });
        });
    });
    socket.addEventListener("close", () => {
      if (!this.disposed && connection === latestConnection)
        this.handleEvent({ type: "socket.closed" });
    });
    socket.addEventListener("error", () => {
      if (!this.disposed && connection === latestConnection) {
        this.handleEvent({
          type: "error",
          code: "socket-error",
          message: "Ошибка соединения со звонком",
        });
      }
    });
  }

  start(
    scenarioVersionId: string,
    _scenarioCategory: string,
    assignmentId?: string,
  ): Promise<void> {
    void this.cancelPlayback();
    this.sendRaw({
      type: "start",
      scenarioVersionId,
      ...(assignmentId ? { assignmentId } : {}),
    });
    return Promise.resolve();
  }
  resume(sessionId: string, resumeListening: boolean): Promise<void> {
    return this.send({ type: "resume", sessionId, resumeListening });
  }
  accept(): Promise<void> {
    return this.send({ type: "accept" });
  }
  decline(): Promise<void> {
    return this.send({ type: "decline" });
  }
  end(): Promise<void> {
    return this.send({ type: "end" });
  }

  holdFloor(): Promise<void> {
    return this.queueFloor(async () => {
      this.listening = false;
      this.pending.clear();
      this.sendRaw({ type: "listen.start" });
      const settings = settingsService.get();
      try {
        await this.microphone.start({
          inputDevice: settings.inputDevice,
          inputDeviceLabel: settings.inputDeviceLabel,
          inputGain: settings.inputGain,
          processing: false,
          onChunk: (chunk) => {
            if (this.listening && this.socket?.readyState === WebSocket.OPEN)
              this.socket.send(chunk);
            else this.pending.push(chunk);
          },
          onLevel: setMicrophoneLevel,
          onFailure: (message) =>
            this.handleEvent({
              type: "error",
              code: "microphone-failed",
              message,
            }),
        });
      } catch (reason) {
        this.sendRaw({ type: "listen.stop" });
        throw reason;
      }
    });
  }

  releaseFloor(): Promise<void> {
    return this.queueFloor(async () => {
      await this.microphone.stop();
      setMicrophoneLevel(0);
      if (this.socket?.readyState === WebSocket.OPEN)
        this.sendRaw({ type: "listen.stop" });
    });
  }
  stopCapture(): Promise<void> {
    return this.microphone.stop();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.unsubscribeSettings();
    if (activeStream === this) setActiveStream(null);
    await this.microphone.stop().catch(() => undefined);
    await this.cancelPlayback();
    this.socket?.close();
    this.socket = null;
    setMicrophoneLevel(0);
  }

  private send(command: CallClientCommand): Promise<void> {
    this.sendRaw(command);
    return Promise.resolve();
  }
  private sendRaw(command: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Соединение со звонком не открыто");
    this.socket.send(JSON.stringify(command));
  }

  private async onMessage(payload: string | ArrayBuffer | Blob): Promise<void> {
    if (this.disposed) return;
    if (payload instanceof ArrayBuffer) {
      this.player.push(payload);
      return;
    }
    if (payload instanceof Blob) {
      this.player.push(await payload.arrayBuffer());
      return;
    }
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      this.callbacks.onUnknownEvent?.(payload);
      return;
    }
    const type = (event as { type?: unknown }).type;
    if (type === "listen.started") {
      this.listening = true;
      for (const chunk of this.pending.drain()) this.socket?.send(chunk);
    } else if (type === "listen.stopped") {
      this.listening = false;
      this.pending.clear();
    } else if (type === "audio.start") {
      const audio = event as { sampleRate?: unknown };
      if (
        typeof audio.sampleRate !== "number" ||
        audio.sampleRate < 8_000 ||
        audio.sampleRate > 192_000
      ) {
        this.handleEvent({
          type: "error",
          code: "audio-format",
          message: "Неподдерживаемая частота TTS",
        });
        return;
      }
      await this.cancelPlayback();
      this.player.setVolume(settingsService.get().outputVolume);
      this.generation = await this.player.start(
        audio.sampleRate,
        settingsService.get().outputDevice,
        settingsService.get().outputDeviceLabel,
      );
    } else if (type === "audio.done") {
      if (this.player.active) {
        this.deferredDone.defer(this.generation, event);
        this.player.finish();
        return;
      }
    } else if (
      type === "request.cancelled" ||
      type === "call.ended" ||
      type === "error"
    ) {
      this.listening = false;
      this.pending.clear();
      await this.cancelPlayback();
    }
    this.handleEvent(event);
  }

  private async cancelPlayback(): Promise<void> {
    this.deferredDone.clear();
    await this.player.cancel();
    this.generation += 1;
  }
  private handleEvent(payload: unknown): void {
    if (this.disposed) return;
    const parsed = CallServerEventSchema.safeParse(payload);
    if (parsed.success) this.callbacks.onEvent(parsed.data);
    else this.callbacks.onUnknownEvent?.(payload);
  }
  private queueFloor(operation: () => Promise<void>): Promise<void> {
    const pending = this.floorQueue.catch(() => undefined).then(operation);
    this.floorQueue = pending.catch(() => undefined);
    return pending;
  }
}

export const callService = {
  createStream(callbacks: CallStreamCallbacks): CallStream {
    return new WebCallStream(callbacks);
  },
};
