import type {
  AudioChunk,
  DialogueGenerationResult,
  PrescribedSpeechRequest,
  SpeechSynthesisStreamEvent,
  TtsSynthesisRequest,
  VoicePipelineRequest,
  VoicePipelineStreamEvent,
} from "@/contracts";
import type { DialogueGenerationService } from "@/modules/dialogue-generation";
import type { SpeechSynthesisService } from "@/modules/speech-synthesis";

import { VoicePipelineError } from "../domain/voice-pipeline.error";
import {
  remainingResponseDelayMs,
  VoicePipelineService,
} from "./voice-pipeline.service";

const request: VoicePipelineRequest = {
  generation: {
    requestId: "request-1",
    sessionId: "session-1",
    scenarioVersionId: "scenario-version-1",
    operatorText: "Где находится возгорание?",
    context: {
      persona: {
        id: "caller-1",
        description: "Взрослый заявитель в состоянии паники",
        language: "Russian",
      },
      allowedFacts: [
        { id: "fire_location", value: "Возгорание находится на кухне" },
      ],
      recentTurns: [],
      turnPlan: {
        reactionAct: "answer",
        minimumResponseDelayMs: 0,
      },
    },
  },
  voice: {
    voiceId: "vivian",
    gender: "male",
    // Голос задаёт ступень паники, а не ответ модели.
    emotion: "panic",
    intensity: 0.75,
    speechRate: 1.2,
  },
};

const modelResult: DialogueGenerationResult = {
  reply: {
    text: "Горит кухня!",
    emotion: "panic",
    intensity: 0.85,
    speechRate: 1.15,
    revealedFactIds: ["fire_location"],
    endCall: false,
  },
  source: "model",
  attempts: [
    {
      attempt: 1,
      timeToFirstTokenMs: 20,
      durationMs: 80,
      outcome: "success",
    },
  ],
};

const fallbackResult: DialogueGenerationResult = {
  reply: {
    text: "Повторите, пожалуйста, вас плохо слышно.",
    emotion: "anxious",
    intensity: 0.5,
    speechRate: 1,
    revealedFactIds: [],
    endCall: false,
  },
  source: "fallback",
  attempts: [
    {
      attempt: 1,
      timeToFirstTokenMs: null,
      durationMs: 20,
      outcome: "provider-error",
    },
    {
      attempt: 2,
      timeToFirstTokenMs: null,
      durationMs: 20,
      outcome: "provider-error",
    },
  ],
};

const createAudioChunk = (
  sequence: number,
  isFinal: boolean,
  audio: AudioChunk["audio"] = new Uint8Array([sequence, sequence + 1]),
  streamId: string = request.generation.requestId,
): AudioChunk => ({
  streamId,
  sequence,
  sampleRate: 24_000,
  channels: 1,
  format: "pcm_s16le",
  isFinal,
  audio,
});

async function* successfulSynthesis(
  audio: AudioChunk["audio"] = new Uint8Array([0, 1, 2, 3]),
): AsyncIterable<SpeechSynthesisStreamEvent> {
  yield {
    type: "audio.chunk",
    chunk: createAudioChunk(0, true, audio),
  };
  yield {
    type: "synthesis.completed",
    metrics: {
      timeToFirstAudioMs: 0,
      durationMs: 0,
      chunkCount: 1,
      audioBytes: audio.byteLength,
      attempts: [{ attempt: 1, durationMs: 0, outcome: "success" }],
    },
  };
}

const createDialogueMock = (result: DialogueGenerationResult = modelResult) => {
  const generate = jest.fn(
    async (
      _input: unknown,
      _signal: AbortSignal,
    ): Promise<DialogueGenerationResult> => result,
  );

  return {
    generate,
    service: { generate } as unknown as DialogueGenerationService,
  };
};

const createSpeechMock = (
  streamFactory: () => AsyncIterable<SpeechSynthesisStreamEvent> = successfulSynthesis,
) => {
  const synthesize = jest.fn(
    (
      _input: unknown,
      _signal: AbortSignal,
    ): AsyncIterable<SpeechSynthesisStreamEvent> => streamFactory(),
  );

  return {
    synthesize,
    service: { synthesize } as unknown as SpeechSynthesisService,
  };
};

const collect = async (
  service: VoicePipelineService,
  input: unknown = request,
  signal: AbortSignal = new AbortController().signal,
): Promise<VoicePipelineStreamEvent[]> => {
  const events: VoicePipelineStreamEvent[] = [];

  for await (const event of service.streamReply(input, signal)) {
    events.push(event);
  }

  return events;
};

const prescribedRequest: PrescribedSpeechRequest = {
  requestId: "opening-1",
  sessionId: "session-1",
  text: "Горит квартира!",
  language: "Russian",
  voice: request.voice,
  minimumResponseDelayMs: 0,
};

describe(VoicePipelineService.name, () => {
  it("streams a validated reply, zero-copy PCM, and full metrics", async () => {
    const audio = new Uint8Array([0, 1, 2, 3]);
    const dialogue = createDialogueMock();
    const speech = createSpeechMock(() => successfulSynthesis(audio));
    const service = new VoicePipelineService(dialogue.service, speech.service);

    const events = await collect(service);

    expect(events.map(({ type }) => type)).toEqual([
      "voice.reply.ready",
      "voice.audio.chunk",
      "voice.completed",
    ]);
    expect(events[0]).toEqual({
      type: "voice.reply.ready",
      result: modelResult,
      timeToReplyMs: expect.any(Number),
    });
    expect(events[1]?.type).toBe("voice.audio.chunk");
    if (events[1]?.type === "voice.audio.chunk") {
      expect(events[1].chunk.audio).toBe(audio);
      expect(events[1].chunk.streamId).toBe(request.generation.requestId);
    }
    expect(events[2]).toEqual({
      type: "voice.completed",
      metrics: expect.objectContaining({
        timeToReplyMs: expect.any(Number),
        timeToFirstAudioMs: expect.any(Number),
        durationMs: expect.any(Number),
        generation: {
          source: "model",
          attempts: modelResult.attempts,
        },
        synthesis: expect.objectContaining({
          chunkCount: 1,
          audioBytes: audio.byteLength,
        }),
        turnTaking: {
          reactionAct: "answer",
          minimumResponseDelayMs: 0,
          elapsedBeforePipelineMs: 0,
          appliedDelayMs: expect.any(Number),
        },
      }),
    });
    expect(dialogue.generate).toHaveBeenCalledTimes(1);
    expect(dialogue.generate).toHaveBeenCalledWith(
      request.generation,
      expect.any(AbortSignal),
    );
    expect(speech.synthesize).toHaveBeenCalledWith(
      {
        requestId: request.generation.requestId,
        sessionId: request.generation.sessionId,
        text: modelResult.reply.text,
        language: "Russian",
        ...request.voice,
      } satisfies TtsSynthesisRequest,
      expect.any(AbortSignal),
    );
  });

  it("synthesizes the validated fallback reply", async () => {
    const dialogue = createDialogueMock(fallbackResult);
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);

    const events = await collect(service);

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "voice.reply.ready",
        result: fallbackResult,
      }),
    );
    expect(speech.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        text: fallbackResult.reply.text,
        // Даже запасная реплика звучит так, как велит ступень паники, а не
        // так, как её пометил бы автор запасного текста.
        emotion: request.voice.emotion,
      }),
      expect.any(AbortSignal),
    );
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "voice.completed",
        metrics: expect.objectContaining({
          generation: expect.objectContaining({ source: "fallback" }),
        }),
      }),
    );
  });

  it("validates input before calling generation or synthesis", () => {
    const dialogue = createDialogueMock();
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);

    expect(() =>
      service.streamReply(
        { ...request, voiceId: "invalid voice" },
        new AbortController().signal,
      ),
    ).toThrow();
    expect(dialogue.generate).not.toHaveBeenCalled();
    expect(speech.synthesize).not.toHaveBeenCalled();
  });

  it("wraps generation failures without calling synthesis", async () => {
    const sensitiveError = new Error(
      `leaked ${request.generation.operatorText}`,
    );
    const dialogue = createDialogueMock();
    dialogue.generate.mockRejectedValue(sensitiveError);
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);

    let thrown: unknown;

    try {
      await collect(service);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<VoicePipelineError>>({
        code: "generation-failed",
        metrics: expect.objectContaining({ timeToReplyMs: null }),
      }),
    );
    expect(String(thrown)).not.toContain(request.generation.operatorText);
    expect(speech.synthesize).not.toHaveBeenCalled();
  });

  it("wraps synthesis failures without regenerating the reply", async () => {
    const dialogue = createDialogueMock();
    const speech = createSpeechMock(() => {
      throw new Error(`leaked ${modelResult.reply.text}`);
    });
    const service = new VoicePipelineService(dialogue.service, speech.service);

    let thrown: unknown;

    try {
      await collect(service);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<VoicePipelineError>>({
        code: "synthesis-failed",
        metrics: expect.objectContaining({
          timeToReplyMs: expect.any(Number),
          audioChunkCount: 0,
        }),
      }),
    );
    expect(String(thrown)).not.toContain(modelResult.reply.text);
    expect(dialogue.generate).toHaveBeenCalledTimes(1);
    expect(speech.synthesize).toHaveBeenCalledTimes(1);
  });

  it("synthesizes prescribed scenario speech without calling the LLM", async () => {
    const dialogue = createDialogueMock();
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);
    const events: SpeechSynthesisStreamEvent[] = [];

    for await (const event of service.streamPrescribedSpeech(
      prescribedRequest,
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "audio.chunk",
      "synthesis.completed",
    ]);
    expect(dialogue.generate).not.toHaveBeenCalled();
    expect(speech.synthesize).toHaveBeenCalledWith(
      {
        requestId: "opening-1",
        sessionId: "session-1",
        text: "Горит квартира!",
        language: "Russian",
        ...request.voice,
      },
      expect.any(AbortSignal),
    );
  });

  it("waits for the prescribed opening pause before starting TTS", async () => {
    jest.useFakeTimers();

    try {
      const dialogue = createDialogueMock();
      const speech = createSpeechMock();
      const service = new VoicePipelineService(
        dialogue.service,
        speech.service,
      );
      const stream = service.streamPrescribedSpeech(
        { ...prescribedRequest, minimumResponseDelayMs: 240 },
        new AbortController().signal,
      );
      const iterator = stream[Symbol.asyncIterator]();
      const firstEvent = iterator.next();

      await Promise.resolve();
      expect(speech.synthesize).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(239);
      expect(speech.synthesize).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await firstEvent;
      expect(speech.synthesize).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("waits only for the part of the planned pause AI latency did not consume", () => {
    expect(remainingResponseDelayMs(500, 180)).toBe(320);
    expect(remainingResponseDelayMs(500, 700)).toBe(0);
  });

  it("does not restart generation or audio after a late synthesis failure", async () => {
    const dialogue = createDialogueMock();
    const speech = createSpeechMock(async function* () {
      yield {
        type: "audio.chunk",
        chunk: createAudioChunk(0, false),
      };
      throw new Error("Provider failed after audio");
    });
    const service = new VoicePipelineService(dialogue.service, speech.service);
    const stream = service.streamReply(request, new AbortController().signal);
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        value: expect.objectContaining({ type: "voice.reply.ready" }),
      }),
    );
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        value: expect.objectContaining({ type: "voice.audio.chunk" }),
      }),
    );
    await expect(iterator.next()).rejects.toEqual(
      expect.objectContaining({
        code: "synthesis-failed",
        metrics: expect.objectContaining({ audioChunkCount: 1 }),
      }),
    );
    expect(dialogue.generate).toHaveBeenCalledTimes(1);
    expect(speech.synthesize).toHaveBeenCalledTimes(1);
  });

  it("preserves backpressure while reading synthesis events", async () => {
    let pulls = 0;
    const dialogue = createDialogueMock();
    const speech = createSpeechMock(async function* () {
      pulls += 1;
      yield { type: "audio.chunk", chunk: createAudioChunk(0, true) };
      pulls += 1;
      yield* successfulSynthesisCompletionOnly();
    });
    const service = new VoicePipelineService(dialogue.service, speech.service);
    const stream = service.streamReply(request, new AbortController().signal);
    const iterator = stream[Symbol.asyncIterator]();

    await iterator.next();
    expect(pulls).toBe(0);
    await iterator.next();
    expect(pulls).toBe(1);
    await iterator.next();
    expect(pulls).toBe(2);
  });

  it.each([
    [
      "mismatched stream ID",
      async function* (): AsyncIterable<SpeechSynthesisStreamEvent> {
        yield {
          type: "audio.chunk",
          chunk: createAudioChunk(
            0,
            true,
            new Uint8Array([0, 1]),
            "other-stream",
          ),
        };
      },
    ],
    [
      "missing completion",
      async function* (): AsyncIterable<SpeechSynthesisStreamEvent> {
        yield { type: "audio.chunk", chunk: createAudioChunk(0, true) };
      },
    ],
    [
      "mismatched completion metrics",
      async function* (): AsyncIterable<SpeechSynthesisStreamEvent> {
        yield { type: "audio.chunk", chunk: createAudioChunk(0, true) };
        yield {
          type: "synthesis.completed",
          metrics: {
            timeToFirstAudioMs: 1,
            durationMs: 2,
            chunkCount: 2,
            audioBytes: 4,
            attempts: [{ attempt: 1, durationMs: 2, outcome: "success" }],
          },
        };
      },
    ],
    [
      "event after completion",
      async function* (): AsyncIterable<SpeechSynthesisStreamEvent> {
        yield { type: "audio.chunk", chunk: createAudioChunk(0, true) };
        yield* successfulSynthesisCompletionOnly();
        yield { type: "audio.chunk", chunk: createAudioChunk(1, true) };
      },
    ],
  ] as const)(
    "rejects %s as a protocol error",
    async (_name, streamFactory) => {
      const dialogue = createDialogueMock();
      const speech = createSpeechMock(streamFactory);

      await expect(
        collect(new VoicePipelineService(dialogue.service, speech.service)),
      ).rejects.toEqual(expect.objectContaining({ code: "protocol-error" }));
    },
  );

  it("propagates pre-existing cancellation before calling dependencies", () => {
    const controller = new AbortController();
    const reason = new Error("Pipeline cancelled");
    controller.abort(reason);
    const dialogue = createDialogueMock();
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);

    expect(() => service.streamReply(request, controller.signal)).toThrow(
      reason,
    );
    expect(dialogue.generate).not.toHaveBeenCalled();
    expect(speech.synthesize).not.toHaveBeenCalled();
  });

  it("propagates cancellation during generation without synthesis", async () => {
    const controller = new AbortController();
    const reason = new Error("Generation cancelled");
    const dialogue = createDialogueMock();
    dialogue.generate.mockImplementation(async () => {
      controller.abort(reason);
      throw reason;
    });
    const speech = createSpeechMock();
    const service = new VoicePipelineService(dialogue.service, speech.service);

    await expect(collect(service, request, controller.signal)).rejects.toBe(
      reason,
    );
    expect(speech.synthesize).not.toHaveBeenCalled();
  });

  it("propagates cancellation during synthesis without wrapping", async () => {
    const controller = new AbortController();
    const reason = new Error("Synthesis cancelled");
    const dialogue = createDialogueMock();
    const speech = createSpeechMock(async function* () {
      controller.abort(reason);
      yield { type: "audio.chunk", chunk: createAudioChunk(0, true) };
    });
    const service = new VoicePipelineService(dialogue.service, speech.service);

    await expect(collect(service, request, controller.signal)).rejects.toBe(
      reason,
    );
    expect(dialogue.generate).toHaveBeenCalledTimes(1);
    expect(speech.synthesize).toHaveBeenCalledTimes(1);
  });
});

async function* successfulSynthesisCompletionOnly(): AsyncIterable<SpeechSynthesisStreamEvent> {
  yield {
    type: "synthesis.completed",
    metrics: {
      timeToFirstAudioMs: 0,
      durationMs: 0,
      chunkCount: 1,
      audioBytes: 2,
      attempts: [{ attempt: 1, durationMs: 0, outcome: "success" }],
    },
  };
}
