import { Channel } from "@tauri-apps/api/core";

import { API_CONFIG } from "../config/api";
import {
  CallServerEventSchema,
  type CallClientCommand,
  type CallServerEvent,
} from "../contracts/call";
import { ipc } from "../lib/ipc";

interface CallStreamCallbacks {
  onEvent: (event: CallServerEvent) => void;
  /** Протокол разошёлся с клиентом; звонок при этом продолжается. */
  onUnknownEvent?: (payload: unknown) => void;
}

/**
 * Учебный звонок: команды вниз, события вверх.
 *
 * Сам сокет живёт в Rust — заголовок `Authorization` webview поставить не может,
 * а речь оператора не должна ходить через IPC. Здесь остаётся то, ради чего
 * нужен webview: разбор событий и проигрывание голоса заявителя.
 */
export interface CallStream {
  connect(token: string): Promise<void>;
  start(scenarioVersionId: string): Promise<void>;
  accept(): Promise<void>;
  decline(): Promise<void>;
  end(): Promise<void>;
  holdFloor(): Promise<void>;
  releaseFloor(): Promise<void>;
  dispose(): Promise<void>;
}

class NativeCallStream implements CallStream {
  private readonly callbacks: CallStreamCallbacks;
  private audioContext?: AudioContext;
  private nextStartTime = 0;
  private sampleRate = 24_000;
  private connected = false;

  constructor(callbacks: CallStreamCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(token: string): Promise<void> {
    const events = new Channel<unknown>();
    events.onmessage = (payload) => this.handleEvent(payload);

    const audio = new Channel<ArrayBuffer>();
    audio.onmessage = (chunk) => this.playPcmChunk(chunk);

    try {
      await ipc.call.connect({
        url: API_CONFIG.getVoicePipelineStreamUrl(),
        token,
        onEvent: events,
        onAudio: audio,
      });
    } catch (reason) {
      throw this.toError(reason);
    }

    this.connected = true;
  }

  start(scenarioVersionId: string): Promise<void> {
    return this.send({ type: "start", scenarioVersionId });
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

  /** Оператор взял слово: микрофон открывает нативная сторона. */
  async holdFloor(): Promise<void> {
    const microphone = new Channel<unknown>();

    // Плагину нужен Channel, но его PCM перехватывается в Rust до webview.
    // Пустой обработчик остаётся только запасным путём для позднего события.
    microphone.onmessage = () => undefined;

    try {
      await ipc.call.attachMicrophoneChannel(microphone.id);
      await ipc.call.startListening();
      await ipc.systemAudio.start(microphone, {
        loopback: false,
        processing: false,
        levelOnly: false,
      });
    } catch (reason) {
      await ipc.systemAudio.stop().catch(() => undefined);
      await ipc.call.stopListening().catch(() => undefined);
      throw this.toError(reason);
    }
  }

  async releaseFloor(): Promise<void> {
    await ipc.systemAudio.stop().catch(() => undefined);
    await ipc.call.stopListening().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    this.connected = false;
    await ipc.systemAudio.stop().catch(() => undefined);
    await ipc.call.disconnect().catch(() => undefined);
    await this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
  }

  private async send(command: CallClientCommand): Promise<void> {
    if (!this.connected) {
      throw new Error("Соединение со звонком не открыто");
    }

    await ipc.call.send(command).catch((reason: unknown) => {
      throw this.toError(reason);
    });
  }

  private handleEvent(payload: unknown): void {
    const parsed = CallServerEventSchema.safeParse(payload);

    if (!parsed.success) {
      this.callbacks.onUnknownEvent?.(payload);

      return;
    }

    if (parsed.data.type === "audio.start") {
      this.sampleRate = parsed.data.sampleRate;
      this.nextStartTime = this.ensureAudioContext().currentTime;
    }

    this.callbacks.onEvent(parsed.data);
  }

  private ensureAudioContext(): AudioContext {
    this.audioContext ??= new AudioContext({ sampleRate: this.sampleRate });

    return this.audioContext;
  }

  /**
   * Каждый кусок планируется сразу за концом предыдущего: приходят они
   * неравномерно, а звучать должны одним потоком без щелчков и наложений.
   */
  private playPcmChunk(buffer: ArrayBuffer): void {
    const context = this.ensureAudioContext();
    const pcm16 = new Int16Array(buffer);

    if (pcm16.length === 0) {
      return;
    }

    const audioBuffer = context.createBuffer(1, pcm16.length, this.sampleRate);
    const channel = audioBuffer.getChannelData(0);

    for (let index = 0; index < pcm16.length; index += 1) {
      channel[index] = pcm16[index] / 0x8000;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(this.nextStartTime, context.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  private toError = (reason: unknown): Error =>
    reason instanceof Error
      ? reason
      : new Error(typeof reason === "string" ? reason : String(reason));
}

export const callService = {
  createStream(callbacks: CallStreamCallbacks): CallStream {
    return new NativeCallStream(callbacks);
  },
};
