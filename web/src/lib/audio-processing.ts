export const TARGET_SAMPLE_RATE = 16_000;
export const PCM_CHUNK_SAMPLES = TARGET_SAMPLE_RATE / 10;
export const PENDING_CHUNKS = 32;
export const BASE_INPUT_GAIN = 3;
export const SOFT_CLIP_THRESHOLD = 0.7;
export const LEVEL_FLOOR_DB = 60;

export function softClip(sample: number): number {
  const magnitude = Math.abs(sample);
  if (magnitude <= SOFT_CLIP_THRESHOLD) return sample;
  const headroom = 1 - SOFT_CLIP_THRESHOLD;
  return (
    Math.sign(sample) *
    (SOFT_CLIP_THRESHOLD +
      headroom * Math.tanh((magnitude - SOFT_CLIP_THRESHOLD) / headroom))
  );
}

/** Чистая версия браузерного ресемплера, используемая также unit-тестами. */
export function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate = TARGET_SAMPLE_RATE,
): Float32Array {
  if (input.length === 0 || sourceRate === targetRate) return input.slice();
  const length = Math.max(
    1,
    Math.floor((input.length * targetRate) / sourceRate),
  );
  const output = new Float32Array(length);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), input.length - 1);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

export function packPcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  });
  return buffer;
}

export function levelFromSamples(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.max(0, Math.min(1, (db + LEVEL_FLOOR_DB) / LEVEL_FLOOR_DB));
}

/**
 * Находит сохранённое устройство среди текущих.
 *
 * Идентификатор устройства браузер может выдать новый, название же остаётся
 * прежним. `null` — выбранного устройства нет, берётся системное.
 */
export function pickDevice(
  devices: readonly { deviceId: string; label: string }[],
  id: string | null,
  label: string | null,
): string | null {
  if (id === null) return null;
  if (devices.some((device) => device.deviceId === id)) return id;
  if (!label) return null;
  return devices.find((device) => device.label === label)?.deviceId ?? null;
}

/** Ошибки getUserMedia/setSinkId по-русски: у части из них сообщение пустое. */
export function describeMediaError(reason: unknown): string {
  const name = reason instanceof Error ? reason.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Браузер не дал доступ к микрофону. Разрешите его в настройках сайта (значок слева от адреса)";
    case "NotReadableError":
    case "AbortError":
      return "Микрофон занят другой программой или отключён";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Выбранное устройство не найдено. Выберите его заново в настройках";
    default:
      return reason instanceof Error && reason.message
        ? reason.message
        : "Не удалось открыть аудиоустройство";
  }
}

export class PendingPcmBuffer {
  private chunks: ArrayBuffer[] = [];

  push(chunk: ArrayBuffer): void {
    if (this.chunks.length === PENDING_CHUNKS) this.chunks.shift();
    this.chunks.push(chunk);
  }

  drain(): ArrayBuffer[] {
    const chunks = this.chunks;
    this.chunks = [];
    return chunks;
  }

  clear(): void {
    this.chunks = [];
  }
}

export class DeferredEvent<T> {
  private value: { generation: number; event: T } | null = null;
  defer(generation: number, event: T): void {
    this.value = { generation, event };
  }
  take(generation: number): T | null {
    if (this.value?.generation !== generation) return null;
    const event = this.value.event;
    this.value = null;
    return event;
  }
  clear(): void {
    this.value = null;
  }
}
