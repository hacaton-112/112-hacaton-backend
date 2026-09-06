const DEFAULT_API_URL = "http://127.0.0.1:3000";
const TARGET_SAMPLE_RATE = 16_000;

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

type ServerEvent =
  | ({ type: "ready" } & Pick<AsrSession, "sessionId" | "sampleRate" | "model">)
  | ({ type: "partial" | "final" } & TranscriptEvent)
  | { type: "pong" }
  | { type: "error"; message: string };

function apiUrl(): string {
  return (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
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
  return request<AsrHealth>("/api/v1/asr/health");
}

async function createAsrSession(language: string): Promise<AsrSession> {
  return request<AsrSession>("/api/v1/asr/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language }),
  });
}

export class AsrStream {
  private socket?: WebSocket;
  private mediaStream?: MediaStream;
  private audioContext?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private silentGain?: GainNode;
  private stopping = false;

  constructor(private readonly callbacks: AsrStreamCallbacks) {}

  async start(language: string): Promise<void> {
    if (this.socket) throw new Error("ASR stream is already active");

    const session = await createAsrSession(language);
    const socket = await this.openSocket(session.wsUrl);
    this.socket = socket;
    this.bindSocket(socket, session);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = mediaStream;

      const audioContext = new AudioContext({ latencyHint: "interactive" });
      this.audioContext = audioContext;
      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN || this.stopping) return;
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsample(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
        if (downsampled.length > 0) socket.send(floatToPcm16(downsampled));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      this.source = source;
      this.processor = processor;
      this.silentGain = silentGain;
      this.callbacks.onReady?.(session);
    } catch (error) {
      this.stopping = true;
      socket.close();
      this.socket = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.socket || this.stopping) return;
    this.stopping = true;
    await this.stopCapture();
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
  }

  async dispose(): Promise<void> {
    await this.stopCapture();
    this.socket?.close();
    this.socket = undefined;
  }

  private async openSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      const timer = window.setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Whisper service"));
      }, 10_000);
      socket.addEventListener(
        "open",
        () => {
          window.clearTimeout(timer);
          resolve(socket);
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Could not connect to Whisper WebSocket"));
        },
        { once: true },
      );
    });
  }

  private bindSocket(socket: WebSocket, session: AsrSession): void {
    socket.addEventListener("message", (message) => {
      if (typeof message.data !== "string") return;
      try {
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.type === "partial") this.callbacks.onPartial?.(event);
        if (event.type === "final") {
          this.callbacks.onFinal?.(event);
          socket.close();
        }
        if (event.type === "error") {
          this.fail(new Error(event.message));
        }
      } catch {
        this.callbacks.onError?.(new Error("Invalid response from Whisper service"));
      }
    });
    socket.addEventListener("close", () => {
      if (!this.stopping) {
        this.callbacks.onError?.(new Error("Whisper WebSocket disconnected"));
      }
      if (this.socket === socket) this.socket = undefined;
    });
    socket.addEventListener("error", () => {
      this.fail(new Error(`Whisper session ${session.sessionId} failed`));
    });
  }

  private fail(error: Error): void {
    if (this.stopping) return;
    this.stopping = true;
    this.callbacks.onError?.(error);
    void this.stopCapture();
    this.socket?.close();
  }

  private async stopCapture(): Promise<void> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.processor = undefined;
    this.source = undefined;
    this.silentGain = undefined;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = undefined;
  }
}

function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input.slice();
  if (inputRate < outputRate) {
    throw new Error(`Unsupported microphone sample rate: ${inputRate}`);
  }

  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];
    output[index] = sum / Math.max(end - start, 1);
  }
  return output;
}

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return output;
}
