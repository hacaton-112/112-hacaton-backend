import { encodeWav, pcmDurationMs } from "@/modules/call-recording/domain/wav";

const readAscii = (wav: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...wav.slice(offset, offset + length));

const view = (wav: Uint8Array): DataView =>
  new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

describe("encodeWav", () => {
  it("describes the audio a player has to make sense of", () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const wav = encodeWav(pcm, 16_000);

    expect(readAscii(wav, 0, 4)).toBe("RIFF");
    expect(readAscii(wav, 8, 4)).toBe("WAVE");
    expect(readAscii(wav, 36, 4)).toBe("data");
    expect(view(wav).getUint16(22, true)).toBe(1);
    expect(view(wav).getUint32(24, true)).toBe(16_000);
    expect(view(wav).getUint32(28, true)).toBe(32_000);
    expect(view(wav).getUint16(34, true)).toBe(16);
  });

  it("keeps the samples byte for byte", () => {
    const pcm = new Uint8Array([9, 8, 7, 6]);

    const wav = encodeWav(pcm, 24_000);

    expect(wav.slice(44)).toEqual(pcm);
    expect(view(wav).getUint32(40, true)).toBe(4);
    expect(view(wav).getUint32(4, true)).toBe(40);
  });

  it("stays a valid file when nothing was recorded", () => {
    const wav = encodeWav(new Uint8Array(), 16_000);

    expect(wav.byteLength).toBe(44);
    expect(view(wav).getUint32(40, true)).toBe(0);
  });
});

describe("pcmDurationMs", () => {
  it("counts a second of speech as a second", () => {
    expect(pcmDurationMs(32_000, 16_000)).toBe(1_000);
    expect(pcmDurationMs(48_000, 24_000)).toBe(1_000);
  });

  it("rounds to the nearest millisecond", () => {
    expect(pcmDurationMs(33, 16_000)).toBe(1);
    expect(pcmDurationMs(0, 16_000)).toBe(0);
  });
});
