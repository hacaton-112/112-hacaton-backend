import { TtsAdapterError } from "@/modules/ai-gateway/infrastructure/tts/tts.error";
import { parsePcmWav, resamplePcm16Mono } from "@/modules/ai-gateway/infrastructure/tts/piper/piper-tts.adapter";

const writeTag = (view: DataView, offset: number, tag: string): void => {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
};

const createWav = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(48);
  const view = new DataView(buffer);
  writeTag(view, 0, "RIFF");
  view.setUint32(4, 40, true);
  writeTag(view, 8, "WAVE");
  writeTag(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22_050, true);
  view.setUint32(28, 44_100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(view, 36, "data");
  view.setUint32(40, 4, true);
  view.setInt16(44, 123, true);
  view.setInt16(46, -123, true);
  return buffer;
};

describe(parsePcmWav.name, () => {
  it("extracts mono PCM and its native sample rate", () => {
    const result = parsePcmWav(createWav());

    expect(result.sampleRate).toBe(22_050);
    expect([...result.audio]).toEqual([123, 0, 133, 255]);
  });

  it("rejects invalid audio", () => {
    expect(() => parsePcmWav(new ArrayBuffer(44))).toThrow(TtsAdapterError);
  });
});

describe(resamplePcm16Mono.name, () => {
  it("converts Piper audio to the pipeline sample rate", () => {
    const source = new Uint8Array([0, 0, 100, 0]);

    expect(resamplePcm16Mono(source, 2, 4).byteLength).toBe(8);
  });
});
