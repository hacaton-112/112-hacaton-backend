import { Channel, invoke } from "@tauri-apps/api/core";

import { ApiRoutes } from "../config/api";
import { CallServerEventSchema, type CallServerEvent } from "../contracts/call";

interface CallStreamCallbacks {
  onEvent: (event: CallServerEvent) => void;
  /** Протокол разошёлся с клиентом; звонок при этом продолжается. */
  onUnknownEvent?: (payload: unknown) => void;
}

const toError = (reason: unknown): Error =>
  reason instanceof Error
    ? reason
    : new Error(typeof reason === "string" ? reason : String(reason));

/**
 * Учебный звонок: команды вниз, события вверх.
 *
 * Сам сокет живёт в Rust — заголовок `Authorization` webview поставить не может,
 * а речь оператора не должна ходить через IPC. Здесь остаётся то, ради чего
 * нужен webview: разбор событий и проигрывание голоса заявителя.
 */
export class CallStream {
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
      await invoke("call_connect", {
        url: ApiRoutes.voicePipeline.stream,
        token,
        onEvent: events,
        onAudio: audio,
      });
    } catch (reason) {
      throw toError(reason);
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
    await invoke("call_listen_start").catch((reason: unknown) => {
      throw toError(reason);
    });
  }

  async releaseFloor(): Promise<void> {
    await invoke("call_listen_stop").catch(() => undefined);
  }

  async dispose(): Promise<void> {
    this.connected = false;
    await invoke("call_disconnect").catch(() => undefined);
    await this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
  }

  private async send(command: Record<string, unknown>): Promise<void> {
    if (!this.connected) {
      throw new Error("Соединение со звонком не открыто");
    }

    await invoke("call_send", { command }).catch((reason: unknown) => {
      throw toError(reason);
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
}
