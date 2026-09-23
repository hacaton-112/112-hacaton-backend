import { decodeRtpMulaw, isNewerRtpSequence } from "./rtp-mulaw";

const packet = (payload: readonly number[], sequence = 1): Uint8Array =>
  Uint8Array.from([
    0x80,
    0x00,
    sequence >> 8,
    sequence & 0xff,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    ...payload,
  ]);

describe(decodeRtpMulaw.name, () => {
  it("decodes RTP μ-law and upsamples it to 16 kHz PCM16 LE", () => {
    const decoded = decodeRtpMulaw(packet([0xff, 0x7f], 513));

    expect(decoded?.sequence).toBe(513);
    expect(decoded?.pcm16.byteLength).toBe(8);
    expect([...decoded!.pcm16]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("rejects malformed packets", () => {
    expect(decodeRtpMulaw(Uint8Array.from([0x80, 0]))).toBeNull();
    expect(decodeRtpMulaw(packet([]))).toBeNull();
  });
});

describe(isNewerRtpSequence.name, () => {
  it("accepts normal and wrapped forward sequences", () => {
    expect(isNewerRtpSequence(11, 10)).toBe(true);
    expect(isNewerRtpSequence(0, 65_535)).toBe(true);
  });

  it("drops duplicates and late packets", () => {
    expect(isNewerRtpSequence(10, 10)).toBe(false);
    expect(isNewerRtpSequence(9, 10)).toBe(false);
  });
});
