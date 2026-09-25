export interface DecodedRtpAudio {
  readonly sequence: number;
  readonly pcm16: Uint8Array;
}

const decodeMuLawSample = (encoded: number): number => {
  const value = ~encoded & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const magnitude = ((mantissa << 3) + 0x84) << exponent;
  return sign === 0 ? magnitude - 0x84 : 0x84 - magnitude;
};

/**
 * Извлекает G.711 μ-law из RTP и сразу приводит 8 кГц к PCM16 LE 16 кГц.
 * Повтор отсчёта — предсказуемый и дешёвый способ повысить частоту для ASR;
 * Asterisk уже выполнил более важное транскодирование исходного SIP-кодека.
 */
export const decodeRtpMulaw = (packet: Uint8Array): DecodedRtpAudio | null => {
  if (packet.byteLength < 12 || packet[0]! >> 6 !== 2) return null;

  const view = new DataView(
    packet.buffer,
    packet.byteOffset,
    packet.byteLength,
  );
  const contributingSources = packet[0]! & 0x0f;
  let offset = 12 + contributingSources * 4;
  if (offset > packet.byteLength) return null;

  if ((packet[0]! & 0x10) !== 0) {
    if (offset + 4 > packet.byteLength) return null;
    const extensionWords = view.getUint16(offset + 2);
    offset += 4 + extensionWords * 4;
  }
  if (offset > packet.byteLength) return null;

  let end = packet.byteLength;
  if ((packet[0]! & 0x20) !== 0) {
    const padding = packet[packet.byteLength - 1] ?? 0;
    if (padding === 0 || padding > end - offset) return null;
    end -= padding;
  }
  if (end <= offset) return null;

  const payload = packet.subarray(offset, end);
  const pcm16 = new Uint8Array(payload.length * 4);
  const pcm = new DataView(pcm16.buffer);

  for (let index = 0; index < payload.length; index += 1) {
    const sample = decodeMuLawSample(payload[index]!);
    // 8 → 16 kHz: каждый отсчёт занимает два соседних отсчёта результата.
    pcm.setInt16(index * 4, sample, true);
    pcm.setInt16(index * 4 + 2, sample, true);
  }

  return { sequence: view.getUint16(2), pcm16 };
};

/** `true`, если пакет новее последнего с учётом переполнения uint16. */
export const isNewerRtpSequence = (next: number, previous: number): boolean => {
  const distance = (next - previous + 0x1_0000) & 0xffff;
  return distance > 0 && distance < 0x8000;
};
