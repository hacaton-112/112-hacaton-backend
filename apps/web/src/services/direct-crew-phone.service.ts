import { API_CONFIG } from "../config/api";
import {
  DirectCrewCallServerEventSchema,
  type DirectCrewCallClientCommand,
  type DirectCrewCallServerEvent,
} from "../contracts/direct-crew-call";
import { TelephonePlayer, WebMicrophoneCapture } from "../lib/web-audio";
import { settingsService } from "./settings.service";

export interface DirectCrewPhoneEvents {
  onReady(): void;
  onConnected(
    event: Extract<DirectCrewCallServerEvent, { type: "call.connected" }>,
  ): void;
  onTranscript(
    event: Extract<DirectCrewCallServerEvent, { type: "transcript" }>,
  ): void;
  onPrompt(
    event: Extract<DirectCrewCallServerEvent, { type: "audio.start" }>,
  ): void;
  onPlaybackLevel(level: number): void;
  onEnded(
    event: Extract<DirectCrewCallServerEvent, { type: "call.ended" }>,
  ): void;
  onError(message: string): void;
  onDisconnected(): void;
}

export const shouldStreamCrewMicrophone = (
  callActive: boolean,
  speechBlocked: boolean,
  socketOpen: boolean,
): boolean => callActive && !speechBlocked && socketOpen;

/** Прямой PCM-транспорт отдельного браузерного телефона ДДС. */
export class DirectCrewPhoneClient {
  private readonly microphone = new WebMicrophoneCapture();
  private readonly player = new TelephonePlayer();
  private socket: WebSocket | null = null;
  private disposed = false;
  private callActive = false;
  private acceptingSpeech = false;
  private currentPromptId: string | null = null;
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly events: DirectCrewPhoneEvents;

  constructor(events: DirectCrewPhoneEvents) {
    this.events = events;
    this.player.onLevel = (level) => this.events.onPlaybackLevel(level);
    this.player.onDrained = () => {
      this.events.onPlaybackLevel(0);
      const promptId = this.currentPromptId;
      if (!promptId || !this.callActive) return;
      this.currentPromptId = null;
      this.acceptingSpeech = true;
      this.send({
        type: "prompt.played",
        eventId: crypto.randomUUID(),
        promptId,
      });
    };
  }

  async connect(token: string): Promise<void> {
    const socket = new WebSocket(API_CONFIG.getDirectCrewCallStreamUrl(), [
      "bearer",
      token,
    ]);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      this.messageQueue = this.messageQueue
        .then(() => this.onMessage(event.data))
        .catch((reason: unknown) =>
          this.events.onError(
            reason instanceof Error ? reason.message : String(reason),
          ),
        );
    });
    socket.addEventListener("close", () => {
      if (!this.disposed) this.events.onDisconnected();
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Не удалось подключить телефон к службе связи")),
        { once: true },
      );
    });
  }

  async start(exerciseId: string, dialedNumber: string): Promise<void> {
    if (this.callActive) throw new Error("Предыдущий разговор ещё не завершён");
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Телефон ещё не готов к звонку");
    }

    const settings = settingsService.get();
    if (settings.outputVolume <= 0) {
      throw new Error(
        "Громкость телефона выключена. Включите звук перед звонком.",
      );
    }
    this.player.setVolume(settings.outputVolume);
    await this.player.prepare(
      settings.outputDevice,
      settings.outputDeviceLabel,
    );
    await this.microphone.start({
      inputDevice: settings.inputDevice,
      inputDeviceLabel: settings.inputDeviceLabel,
      inputGain: settings.inputGain,
      // Телефон наряда остаётся полудуплексным, но речевая обработка также
      // защищает ASR от фонового шума и остаточного эха гарнитуры.
      processing: true,
      onChunk: (chunk) => {
        if (
          shouldStreamCrewMicrophone(
            this.callActive,
            !this.acceptingSpeech,
            this.socket?.readyState === WebSocket.OPEN,
          )
        ) {
          this.socket?.send(chunk);
        }
      },
      onLevel: () => undefined,
      onFailure: (message) => this.events.onError(message),
    });
    this.callActive = true;
    this.acceptingSpeech = false;
    try {
      this.send({
        type: "start",
        eventId: crypto.randomUUID(),
        exerciseId,
        dialedNumber,
      });
    } catch (reason) {
      this.callActive = false;
      this.acceptingSpeech = false;
      await Promise.all([
        this.microphone.stop().catch(() => undefined),
        this.player.cancel().catch(() => undefined),
      ]);
      throw reason;
    }
  }

  async end(): Promise<void> {
    if (!this.callActive) return;
    this.send({ type: "end", eventId: crypto.randomUUID() });
    this.callActive = false;
    this.acceptingSpeech = false;
    this.currentPromptId = null;
    await Promise.all([this.microphone.stop(), this.player.cancel()]).then(
      () => undefined,
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.callActive && this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: "end", eventId: crypto.randomUUID() });
    }
    this.callActive = false;
    this.acceptingSpeech = false;
    this.currentPromptId = null;
    await Promise.all([
      this.microphone.stop().catch(() => undefined),
      this.player.cancel().catch(() => undefined),
    ]);
    this.socket?.close();
    this.socket = null;
  }

  private send(command: DirectCrewCallClientCommand): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Соединение телефона закрыто");
    }
    this.socket.send(JSON.stringify(command));
  }

  private async onMessage(payload: string | ArrayBuffer | Blob): Promise<void> {
    if (payload instanceof ArrayBuffer) {
      this.player.push(payload);
      return;
    }
    if (payload instanceof Blob) {
      this.player.push(await payload.arrayBuffer());
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      throw new Error("Телефон получил повреждённые данные");
    }
    const parsed = DirectCrewCallServerEventSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Телефон получил неподдерживаемые данные");
    }
    const event = parsed.data;

    switch (event.type) {
      case "socket.ready":
        this.events.onReady();
        return;
      case "call.connected":
        this.events.onConnected(event);
        return;
      case "transcript":
        this.events.onTranscript(event);
        return;
      case "audio.start": {
        this.acceptingSpeech = false;
        this.currentPromptId = event.promptId;
        const settings = settingsService.get();
        this.player.setVolume(settings.outputVolume);
        await this.player.start(
          event.sampleRate,
          settings.outputDevice,
          settings.outputDeviceLabel,
        );
        this.events.onPrompt(event);
        return;
      }
      case "audio.done":
        if (event.promptId === this.currentPromptId) this.player.finish();
        return;
      case "call.ended":
        this.callActive = false;
        this.acceptingSpeech = false;
        this.currentPromptId = null;
        await this.microphone.stop();
        this.events.onEnded(event);
        return;
      case "error":
        this.events.onError(event.message);
        return;
      case "listen.started":
      case "listen.stopped":
        return;
    }
  }
}
