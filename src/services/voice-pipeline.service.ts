import { ApiRoutes } from "../config/api";

export type ReplySource = "model" | "fallback";

interface VoicePipelineCallbacks {
  onReplyText?: (text: string, source: ReplySource) => void;
  onAudioStart?: () => void;
  onAudioDone?: () => void;
  onError?: (error: Error) => void;
}

type ServerEvent =
  | { type: "reply.text"; text: string; source: ReplySource }
  | { type: "audio.start"; sampleRate: number; format: string }
  | { type: "audio.done" }
  | { type: "error"; message: string };

/**
 * Один WS на весь диалог: после каждой финальной ASR-расшифровки шлём
 * operatorText через speak() и проигрываем PCM-чанки по мере поступления
 * (см. VoicePipelineGateway в 112-hacaton-backend) — без ожидания полного
 * ответа, звук начинает звучать, как только придёт первый чанк.
 */
export class VoicePipelineStream {
  private socket?: WebSocket;
  private audioContext?: AudioContext;
  private nextStartTime = 0;
  private sampleRate = 24_000;
  private readonly callbacks: VoicePipelineCallbacks;

  constructor(callbacks: VoicePipelineCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(ApiRoutes.voicePipeline.stream);
      socket.binaryType = "arraybuffer";

      const timer = window.setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to voice pipeline"));
      }, 10_000);

      socket.addEventListener(
        "open",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Could not connect to voice pipeline"));
        },
        { once: true },
      );
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = undefined;
      });

      this.socket = socket;
    });
  }

  speak(operatorText: string, voiceId?: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Voice pipeline is not connected");
    }
    this.socket.send(
      JSON.stringify({
        type: "speak",
        operatorText,
        ...(voiceId ? { voiceId } : {}),
      }),
    );
  }

  dispose(): void {
    this.socket?.close();
    this.socket = undefined;
    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data === "string") {
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(event.data) as ServerEvent;
      } catch {
        this.callbacks.onError?.(
          new Error("Invalid message from voice pipeline"),
        );
        return;
      }

      if (parsed.type === "reply.text")
        this.callbacks.onReplyText?.(parsed.text, parsed.source);
      if (parsed.type === "audio.start") {
        this.sampleRate = parsed.sampleRate;
        this.nextStartTime = this.ensureAudioContext().currentTime;
        this.callbacks.onAudioStart?.();
      }
      if (parsed.type === "audio.done") this.callbacks.onAudioDone?.();
      if (parsed.type === "error")
        this.callbacks.onError?.(new Error(parsed.message));
      return;
    }

    this.playPcmChunk(event.data as ArrayBuffer);
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }
    return this.audioContext;
  }

  // Планируем каждый чанк сразу после конца предыдущего (nextStartTime) —
  // так PCM-чанки, приходящие неравномерно, звучат одним непрерывным потоком
  // без щелчков и наложений.
  private playPcmChunk(buffer: ArrayBuffer): void {
    const context = this.ensureAudioContext();
    const pcm16 = new Int16Array(buffer);
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
