import type { SpeechSynthesisMetrics, TtsSynthesisRequest } from "@/contracts";

import {
  characterErrorRate,
  concatPcmChunks,
  createTtsDiagnosticArtifact,
  createTtsDiagnosticManifest,
  resamplePcm16Mono,
  type TtsDiagnosticCase,
} from "./tts-diagnostic";

const diagnosticCase: TtsDiagnosticCase = {
  id: "calm-address",
  text: "Адрес: улица Учебная, дом двенадцать.",
  emotion: "calm",
  intensity: 0.22,
  speechRate: 1,
};

const request: TtsSynthesisRequest = {
  requestId: "tts-diagnostic-calm-address-r01",
  sessionId: "tts-diagnostic",
  text: diagnosticCase.text,
  language: "Russian",
  voiceId: "Dylan",
  gender: "male",
  emotion: diagnosticCase.emotion,
  intensity: diagnosticCase.intensity,
  speechRate: diagnosticCase.speechRate,
};

const metrics: SpeechSynthesisMetrics = {
  timeToFirstAudioMs: 20,
  durationMs: 40,
  chunkCount: 2,
  audioBytes: 480,
  attempts: [{ attempt: 1, durationMs: 37, outcome: "success" }],
};

describe("TTS diagnostic artifacts", () => {
  it("joins provider chunks without changing their bytes", () => {
    expect(
      concatPcmChunks([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5, 6])]),
    ).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it("describes the exact request and audio deterministically", () => {
    const pcm = new Uint8Array(480).map((_, index) => index % 251);
    const first = createTtsDiagnosticArtifact({
      diagnosticCase,
      repetition: 1,
      request,
      pcm,
      metrics,
      asr: null,
    });
    const second = createTtsDiagnosticArtifact({
      diagnosticCase,
      repetition: 1,
      request,
      pcm,
      metrics,
      asr: null,
    });

    expect(first.entry).toEqual(second.entry);
    expect(first.entry.artifact).toBe("calm-address-r01.wav");
    expect(first.entry.request).toEqual(request);
    expect(first.entry.audioDurationMs).toBe(10);
    expect(first.entry.sha256).toHaveLength(64);
    expect(first.wav.slice(44)).toEqual(pcm);
  });

  it("builds a versioned manifest without adding implicit fields", () => {
    const artifact = createTtsDiagnosticArtifact({
      diagnosticCase,
      repetition: 1,
      request,
      pcm: new Uint8Array(480),
      metrics,
      asr: null,
    });
    const manifest = createTtsDiagnosticManifest({
      schemaVersion: 1,
      createdAt: "2026-09-10T12:00:00.000Z",
      provider: {
        baseUrl: "http://127.0.0.1:5000",
        model: "piper",
        requestTimeoutMs: 60_000,
      },
      options: {
        repetitions: 1,
        voiceId: "Dylan",
        asrRoundTrip: false,
      },
      entries: [artifact.entry],
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.entries).toEqual([artifact.entry]);
  });
});

describe("TTS diagnostic ASR comparison", () => {
  it("resamples PCM16 with linear interpolation", () => {
    const input = new Uint8Array(12);
    const inputView = new DataView(input.buffer);

    [0, 1_000, 2_000, 3_000, 4_000, 5_000].forEach((sample, index) => {
      inputView.setInt16(index * 2, sample, true);
    });

    const output = resamplePcm16Mono(input, 24_000, 16_000);
    const outputView = new DataView(output.buffer);

    expect(output.byteLength).toBe(8);
    expect(
      Array.from({ length: 4 }, (_, index) =>
        outputView.getInt16(index * 2, true),
      ),
    ).toEqual([0, 1_500, 3_000, 4_500]);
  });

  it("compares spoken text without punctuation and case noise", () => {
    expect(
      characterErrorRate(
        "Улица Учебная, дом двенадцать!",
        "улица учебная дом двенадцать",
      ),
    ).toBe(0);
    expect(characterErrorRate("дом", "дым")).toBe(0.3333);
  });
});
