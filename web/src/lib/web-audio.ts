import {
  BASE_INPUT_GAIN,
  describeMediaError,
  pickDevice,
} from "./audio-processing";

export interface AudioDeviceInfo {
  id: string;
  name: string;
  /** Название от браузера; пустое, пока нет разрешения на микрофон. */
  label: string;
  isDefault: boolean;
}

export interface AudioDeviceCatalog {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
}

export type MicrophonePermissionStatus = "allowed" | "denied" | "unknown";

export async function microphonePermissionStatus(): Promise<MicrophonePermissionStatus> {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state === "granted"
      ? "allowed"
      : status.state === "denied"
        ? "denied"
        : "unknown";
  } catch {
    return "unknown";
  }
}

export async function requestMicrophoneAccess(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function enumerateAudioDevices(
  requestAccess = true,
): Promise<AudioDeviceCatalog> {
  if (requestAccess) await requestMicrophoneAccess();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const convert = (device: MediaDeviceInfo): AudioDeviceInfo => ({
    id: device.deviceId,
    name: device.label || "Аудиоустройство",
    label: device.label,
    isDefault: device.deviceId === "default",
  });
  return {
    inputs: devices
      .filter((device) => device.kind === "audioinput")
      .map(convert),
    outputs: devices
      .filter((device) => device.kind === "audiooutput")
      .map(convert),
  };
}

async function resolveDevice(
  kind: MediaDeviceKind,
  id: string | null,
  label: string | null,
): Promise<string | null> {
  if (id === null) return null;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return pickDevice(
    devices.filter((device) => device.kind === kind),
    id,
    label,
  );
}

/**
 * Открывает выбранный микрофон, а если его больше нет — системный.
 *
 * Без запасного пути устаревший идентификатор давал OverconstrainedError с
 * пустым сообщением: звонок шёл без микрофона и без видимой ошибки.
 */
async function openMicrophone(
  id: string | null,
  label: string | null,
  processing: boolean,
): Promise<MediaStream> {
  const audio = {
    echoCancellation: processing,
    noiseSuppression: processing,
    autoGainControl: processing,
  };
  try {
    const deviceId = await resolveDevice("audioinput", id, label);
    if (deviceId !== null) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...audio, deviceId: { exact: deviceId } },
        });
      } catch (reason) {
        const name = reason instanceof Error ? reason.name : "";
        if (name !== "OverconstrainedError" && name !== "NotFoundError")
          throw reason;
      }
    }
    return await navigator.mediaDevices.getUserMedia({ audio });
  } catch (reason) {
    throw new Error(describeMediaError(reason), { cause: reason });
  }
}

interface CaptureOptions {
  inputDevice: string | null;
  inputDeviceLabel?: string | null;
  inputGain: number;
  processing?: boolean;
  onChunk?: (chunk: ArrayBuffer) => void;
  onLevel: (level: number) => void;
  onFailure: (message: string) => void;
  monitor?: {
    outputDevice: string | null;
    outputDeviceLabel?: string | null;
    outputVolume: number;
  };
}

export class WebMicrophoneCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private monitorAudio: HTMLAudioElement | null = null;
  private monitorGain: GainNode | null = null;

  async start(options: CaptureOptions): Promise<void> {
    await this.stop();
    const stream = await openMicrophone(
      options.inputDevice,
      options.inputDeviceLabel ?? null,
      options.processing ?? false,
    );
    const context = new AudioContext();
    await context.audioWorklet.addModule("/worklets/microphone-processor.js");
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "microphone-processor", {
      processorOptions: { inputGain: options.inputGain * BASE_INPUT_GAIN },
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data as {
        type?: string;
        level?: number;
        chunk?: ArrayBuffer;
      };
      if (payload.type === "level" && typeof payload.level === "number") {
        options.onLevel(payload.level);
      } else if (payload.type === "chunk" && payload.chunk) {
        options.onChunk?.(payload.chunk);
      }
    };
    const track = stream.getAudioTracks()[0];
    track?.addEventListener("ended", () =>
      options.onFailure("Микрофон перестал отвечать"),
    );
    source.connect(node);

    if (options.monitor) {
      const monitorGain = context.createGain();
      monitorGain.gain.value = options.monitor.outputVolume;
      node.connect(monitorGain);
      const destination = context.createMediaStreamDestination();
      monitorGain.connect(destination);
      const audio = new Audio();
      audio.srcObject = destination.stream;
      const sinkAudio = audio as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      const monitorDevice = await resolveDevice(
        "audiooutput",
        options.monitor.outputDevice,
        options.monitor.outputDeviceLabel ?? null,
      );
      if (monitorDevice && sinkAudio.setSinkId) {
        await sinkAudio.setSinkId(monitorDevice);
      }
      await audio.play();
      this.monitorAudio = audio;
      this.monitorGain = monitorGain;
    }

    this.context = context;
    this.stream = stream;
    this.node = node;
    await context.resume();
  }

  setInputGain(gain: number): void {
    this.node?.port.postMessage({
      type: "gain",
      value: gain * BASE_INPUT_GAIN,
    });
  }

  setOutputVolume(volume: number): void {
    if (this.monitorGain) this.monitorGain.gain.value = volume;
  }

  async stop(): Promise<void> {
    this.monitorAudio?.pause();
    this.monitorAudio = null;
    this.monitorGain = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.node?.disconnect();
    this.node = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close();
  }
}

export class TelephonePlayer {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private outputAudio: HTMLAudioElement | null = null;
  private generation = 0;
  private outputVolume = 1;
  onLevel: (level: number) => void = () => undefined;
  onDrained: (generation: number) => void = () => undefined;

  get active(): boolean {
    return this.node !== null;
  }

  setVolume(volume: number): void {
    this.outputVolume = volume;
    this.node?.port.postMessage({ type: "volume", value: volume });
  }

  async start(
    sampleRate: number,
    savedOutputDevice: string | null,
    savedOutputLabel: string | null = null,
  ): Promise<number> {
    await this.cancel();
    // Пропавший динамик не должен срывать реплику: звук идёт в системный.
    const outputDevice = await resolveDevice(
      "audiooutput",
      savedOutputDevice,
      savedOutputLabel,
    ).catch(() => null);
    const generation = ++this.generation;
    const context = new AudioContext();
    await context.audioWorklet.addModule("/worklets/telephone-processor.js");
    const node = new AudioWorkletNode(context, "telephone-processor", {
      outputChannelCount: [1],
      processorOptions: { sampleRate, volume: this.outputVolume, generation },
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data as {
        type?: string;
        level?: number;
        generation?: number;
      };
      if (payload.generation !== this.generation) return;
      if (payload.type === "level" && typeof payload.level === "number") {
        this.onLevel(payload.level);
      } else if (payload.type === "drained") {
        this.onDrained(payload.generation);
      }
    };

    const sinkContext = context as AudioContext & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (outputDevice && sinkContext.setSinkId) {
      await sinkContext.setSinkId(outputDevice);
      node.connect(context.destination);
    } else if (outputDevice) {
      const destination = context.createMediaStreamDestination();
      node.connect(destination);
      const audio = new Audio();
      audio.srcObject = destination.stream;
      const sinkAudio = audio as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (sinkAudio.setSinkId) {
        await sinkAudio.setSinkId(outputDevice);
        await audio.play();
        this.outputAudio = audio;
      } else {
        node.disconnect(destination);
        node.connect(context.destination);
      }
    } else {
      node.connect(context.destination);
    }
    this.context = context;
    this.node = node;
    await context.resume();
    return generation;
  }

  push(chunk: ArrayBuffer): void {
    this.node?.port.postMessage({ type: "pcm", chunk }, [chunk]);
  }

  finish(): void {
    this.node?.port.postMessage({ type: "finish" });
  }

  async cancel(): Promise<void> {
    this.generation += 1;
    this.outputAudio?.pause();
    this.outputAudio = null;
    this.node?.disconnect();
    this.node = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close();
  }
}

export const supportsOutputDeviceSelection =
  "setSinkId" in AudioContext.prototype ||
  "setSinkId" in HTMLMediaElement.prototype;
