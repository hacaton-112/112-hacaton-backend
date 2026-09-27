import {
  BASE_INPUT_GAIN,
  describeMediaError,
  pickDevice,
} from "./audio-processing";
import { requestMicrophoneAccess } from "./media-permissions";

export {
  microphonePermissionStatus,
  type MicrophonePermissionStatus,
} from "./media-permissions";

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

export function requireSelectedOutputDevice(
  requestedDevice: string | null,
  requestedLabel: string | null,
  resolvedDevice: string | null,
): string | null {
  if (requestedDevice !== null && resolvedDevice === null) {
    throw new Error(
      `Выбранный аудиовыход «${requestedLabel || "без названия"}» недоступен. Обновите список устройств или выберите системный выход.`,
    );
  }
  return resolvedDevice;
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
  private outputNode: AudioNode | null = null;
  private outputAudio: HTMLAudioElement | null = null;
  private preparedOutputKey: string | null = null;
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

  /**
   * Активирует Web Audio непосредственно из пользовательского клика.
   *
   * Если создавать AudioContext только после пришедшего по WebSocket
   * `audio.start`, Chromium может оставить его suspended: worklet при этом
   * способен обработать очередь и прислать `drained`, хотя пользователь ничего
   * не услышит. Подготовленный контекст переиспользуется для всех реплик звонка.
   */
  async prepare(
    savedOutputDevice: string | null,
    savedOutputLabel: string | null = null,
  ): Promise<void> {
    const outputKey = `${savedOutputDevice ?? "system"}\u0000${savedOutputLabel ?? ""}`;
    if (
      this.context &&
      this.context.state !== "closed" &&
      this.preparedOutputKey === outputKey
    ) {
      await this.context.resume();
      if (this.context.state !== "running") {
        throw new Error(
          "Браузер приостановил звук. Нажмите «Проверить звук» и разрешите воспроизведение.",
        );
      }
      return;
    }

    await this.cancel();
    const context = new AudioContext();
    this.context = context;
    this.preparedOutputKey = outputKey;

    try {
      // resume() вызывается до первого await, пока браузер ещё видит исходный
      // пользовательский жест кнопки «Позвонить» или «Проверить звук».
      const resume = context.resume();
      const [outputDevice] = await Promise.all([
        resolveDevice("audiooutput", savedOutputDevice, savedOutputLabel).then(
          (resolved) =>
            requireSelectedOutputDevice(
              savedOutputDevice,
              savedOutputLabel,
              resolved,
            ),
        ),
        context.audioWorklet.addModule("/worklets/telephone-processor.js"),
        resume,
      ]);

      const sinkContext = context as AudioContext & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (outputDevice && sinkContext.setSinkId) {
        await sinkContext.setSinkId(outputDevice);
        this.outputNode = context.destination;
      } else if (outputDevice) {
        const destination = context.createMediaStreamDestination();
        const audio = new Audio();
        audio.srcObject = destination.stream;
        const sinkAudio = audio as HTMLAudioElement & {
          setSinkId?: (sinkId: string) => Promise<void>;
        };
        if (sinkAudio.setSinkId) {
          await sinkAudio.setSinkId(outputDevice);
          await audio.play();
          this.outputAudio = audio;
          this.outputNode = destination;
        } else {
          this.outputNode = context.destination;
        }
      } else {
        this.outputNode = context.destination;
      }

      await context.resume();
      if (context.state !== "running") {
        throw new Error(
          "Браузер приостановил звук. Нажмите «Проверить звук» и разрешите воспроизведение.",
        );
      }
    } catch (reason) {
      await this.cancel();
      throw reason;
    }
  }

  async start(
    sampleRate: number,
    savedOutputDevice: string | null,
    savedOutputLabel: string | null = null,
  ): Promise<number> {
    await this.prepare(savedOutputDevice, savedOutputLabel);
    this.stopPrompt();
    const generation = ++this.generation;
    const context = this.context;
    const outputNode = this.outputNode;
    if (!context || !outputNode) {
      throw new Error("Аудиовыход телефона не подготовлен");
    }
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

    node.connect(outputNode);
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
    this.stopPrompt();
    this.outputAudio?.pause();
    this.outputAudio = null;
    this.outputNode = null;
    this.preparedOutputKey = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close();
  }

  private stopPrompt(): void {
    this.generation += 1;
    this.node?.disconnect();
    this.node = null;
  }
}

const TEST_TONE_SAMPLE_RATE = 24_000;

export function createTelephoneTestTone(
  durationMs = 600,
  sampleRate = TEST_TONE_SAMPLE_RATE,
): ArrayBuffer {
  const sampleCount = Math.max(
    1,
    Math.round((durationMs / 1_000) * sampleRate),
  );
  const buffer = new ArrayBuffer(sampleCount * Int16Array.BYTES_PER_ELEMENT);
  const view = new DataView(buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const envelope = Math.sin(Math.PI * progress) ** 2;
    const seconds = index / sampleRate;
    const signal =
      (Math.sin(2 * Math.PI * 660 * seconds) * 0.7 +
        Math.sin(2 * Math.PI * 880 * seconds) * 0.3) *
      envelope *
      0.45;
    view.setInt16(index * 2, Math.round(signal * 32_767), true);
  }
  return buffer;
}

export async function playTelephoneTestTone({
  outputDevice,
  outputDeviceLabel,
  outputVolume,
  onLevel = () => undefined,
}: {
  outputDevice: string | null;
  outputDeviceLabel: string | null;
  outputVolume: number;
  onLevel?: (level: number) => void;
}): Promise<void> {
  const player = new TelephonePlayer();
  player.setVolume(outputVolume);
  player.onLevel = onLevel;
  await player.prepare(outputDevice, outputDeviceLabel);
  await player.start(TEST_TONE_SAMPLE_RATE, outputDevice, outputDeviceLabel);
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2_000);
    player.onDrained = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    player.push(createTelephoneTestTone());
    player.finish();
  });
  await player.cancel();
  onLevel(0);
}

export const supportsOutputDeviceSelection =
  (typeof AudioContext !== "undefined" &&
    "setSinkId" in AudioContext.prototype) ||
  (typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype);
