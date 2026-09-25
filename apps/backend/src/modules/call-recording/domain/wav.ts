const WAV_HEADER_BYTES = 44;
const PCM_FORMAT_TAG = 1;
const BYTES_PER_SAMPLE = 2;
const MONO = 1;
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Оборачивает PCM S16LE в WAV.
 *
 * Разговор хранится в несжатом виде намеренно: запись слушает разбор занятия,
 * а не пользователь на мобильном интернете, и кодек здесь стоил бы зависимости
 * и потерь на разборе речи ради экономии, которая никому не нужна.
 */
export const encodeWav = (
  pcm: Uint8Array,
  sampleRate: number,
): Uint8Array<ArrayBuffer> => {
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const byteRate = sampleRate * MONO * BYTES_PER_SAMPLE;

  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES - 8 + pcm.byteLength, true);
  writeAscii(wav, 8, "WAVE");

  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT_TAG, true);
  view.setUint16(22, MONO, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, MONO * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);

  writeAscii(wav, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, WAV_HEADER_BYTES);

  return wav;
};

/** Длительность записанного куска: смещения в манифесте считаются по ней. */
export const pcmDurationMs = (byteLength: number, sampleRate: number): number =>
  Math.round(
    (byteLength / BYTES_PER_SAMPLE / sampleRate) * MILLISECONDS_PER_SECOND,
  );

const writeAscii = (target: Uint8Array, offset: number, text: string): void => {
  for (let index = 0; index < text.length; index += 1) {
    target[offset + index] = text.charCodeAt(index);
  }
};
