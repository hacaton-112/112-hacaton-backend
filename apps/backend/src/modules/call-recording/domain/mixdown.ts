/** Общий шаг записи: у заявителя 24 кГц, у оператора 16 кГц. */
export const MIXDOWN_SAMPLE_RATE = 24_000;

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const INT16_MIN = -32_768;
const INT16_MAX = 32_767;

export interface RecordingPart {
  /** WAV одной реплики, как он лежит в хранилище. */
  readonly audio: Uint8Array;
  readonly startMs: number;
  readonly sampleRate: number;
}

const ascii = (bytes: Uint8Array, at: number): string =>
  String.fromCodePoint(...bytes.subarray(at, at + 4));

/**
 * Достаёт отсчёты из WAV.
 *
 * Заголовок читается по чанкам, а не по фиксированному смещению: запись пишет
 * этот же сервис, но чужой инструмент вправе вставить свои чанки, и молча
 * принять их за звук — значит выдать треск вместо речи.
 */
export const readPcm = (wav: Uint8Array): Int16Array => {
  if (wav.byteLength < WAV_HEADER_BYTES || ascii(wav, 0) !== "RIFF") {
    throw new Error("Recording part is not a WAV file");
  }

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let at = 12;

  while (at + 8 <= wav.byteLength) {
    const size = view.getUint32(at + 4, true);
    const body = at + 8;

    if (ascii(wav, at) === "data") {
      const length = Math.min(size, wav.byteLength - body);
      const samples = new Int16Array(length >> 1);

      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(body + index * BYTES_PER_SAMPLE, true);
      }

      return samples;
    }

    at = body + size + (size % 2);
  }

  throw new Error("Recording part has no audio data");
};

/** Линейная передискретизация: без неё речь оператора звучит ускоренной. */
export const resample = (
  samples: Int16Array,
  from: number,
  to: number,
): Int16Array => {
  if (from === to || samples.length === 0) {
    return samples;
  }

  const ratio = from / to;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const resampled = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), samples.length - 1);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;

    resampled[index] =
      (samples[left] ?? 0) * (1 - weight) + (samples[right] ?? 0) * weight;
  }

  return resampled;
};

/**
 * Собирает разговор в одну дорожку.
 *
 * Реплики ложатся на общую ось по своим смещениям, а промежутки остаются
 * тишиной: пауза перед ответом — часть работы оператора, и на разборе она
 * должна быть слышна так же, как слова.
 */
export const mixCallRecording = (
  parts: readonly RecordingPart[],
  sampleRate: number = MIXDOWN_SAMPLE_RATE,
): Int16Array => {
  const prepared = parts.map((part) => ({
    startSample: Math.max(0, Math.round((part.startMs * sampleRate) / 1_000)),
    samples: resample(readPcm(part.audio), part.sampleRate, sampleRate),
  }));
  const length = prepared.reduce(
    (total, part) => Math.max(total, part.startSample + part.samples.length),
    0,
  );

  // Складывать в Int16 нельзя: там, где оператор перебивает заявителя, сумма
  // выходит за границы типа и переполнение слышно щелчком.
  const mixed = new Int32Array(length);

  for (const part of prepared) {
    for (let index = 0; index < part.samples.length; index += 1) {
      mixed[part.startSample + index] += part.samples[index] ?? 0;
    }
  }

  const track = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    track[index] = Math.min(INT16_MAX, Math.max(INT16_MIN, mixed[index] ?? 0));
  }

  return track;
};

/** Отсчёты в байты для `encodeWav`. */
export const toPcmBytes = (samples: Int16Array): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(samples.length * BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * BYTES_PER_SAMPLE, samples[index] ?? 0, true);
  }

  return bytes;
};
