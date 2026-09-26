import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";

import { Logger } from "@nestjs/common";
import WebSocket, { type RawData } from "ws";

import { AppConflictException } from "@/common/exceptions/app.exception";
import { OfflineAudioNotReadyError } from "@/modules/scenario-audio/application/scenario-audio.service";
import {
  ErrorCodes,
  VoicePipelineServerEventSchema,
  type PrescribedSpeechRequest,
  type SpeechSynthesisStreamEvent,
  type VoicePipelineRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";

import type {
  AsrStreamer,
  AsrStreamHandle,
  AsrTranscript,
} from "@/modules/asr/ports/asr-stream.port";
import type { AccessTokenVerifier } from "@/modules/auth/infrastructure/access-token.verifier";
import type { CallRecorder, RecordingSegment } from "@/modules/call-recording";
import {
  ScenarioEngineError,
  type CallSnapshot,
  type ScenarioEngineService,
} from "@/modules/scenario-engine";
import type { TrainingService } from "@/modules/training/application/training.service";

import type { VoicePipelineRequestFactory } from "@/modules/voice-pipeline/application/voice-pipeline-request.factory";
import type { VoicePipelineService } from "@/modules/voice-pipeline/application/voice-pipeline.service";
import {
  VoicePipelineGateway,
  websocketAuthorization,
} from "@/modules/voice-pipeline/transport/websocket/voice-pipeline.gateway";

const request: VoicePipelineRequest = {
  generation: {
    requestId: "request-1",
    sessionId: "session-1",
    scenarioVersionId: "scenario-version-1",
    operatorText: "Что произошло?",
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
    },
  },
  voice: {
    voiceId: "Vivian",
    gender: "male",
    emotion: "panic",
    intensity: 0.75,
    speechRate: 1.2,
  },
};

const attempts = [
  {
    attempt: 1,
    timeToFirstTokenMs: 10,
    durationMs: 20,
    outcome: "success" as const,
  },
];

const reply = {
  text: "На кухне пожар.",
  emotion: "panic" as const,
  intensity: 0.8,
  speechRate: 1,
  revealedFactIds: ["fire_location"],
  endCall: false,
};

const metrics = {
  timeToReplyMs: 20,
  timeToFirstAudioMs: 30,
  durationMs: 40,
  generation: { source: "model" as const, attempts },
  synthesis: {
    timeToFirstAudioMs: 10,
    durationMs: 20,
    chunkCount: 2,
    audioBytes: 4,
    attempts: [{ attempt: 1, durationMs: 20, outcome: "success" as const }],
  },
};

type StreamFactory = (
  request: VoicePipelineRequest,
  signal: AbortSignal,
) => AsyncIterable<VoicePipelineStreamEvent>;

const failingIterable = (
  failure: () => Promise<never>,
): AsyncIterable<VoicePipelineStreamEvent> => ({
  [Symbol.asyncIterator]: () => ({ next: failure }),
});

async function* successfulStream(
  _request: VoicePipelineRequest,
  _signal: AbortSignal,
): AsyncIterable<VoicePipelineStreamEvent> {
  yield {
    type: "voice.reply.ready",
    result: { reply, source: "model", attempts },
    timeToReplyMs: 20,
  };
  yield {
    type: "voice.audio.chunk",
    chunk: {
      streamId: "request-1",
      sequence: 0,
      sampleRate: 24_000,
      channels: 1,
      format: "pcm_s16le",
      isFinal: false,
      audio: new Uint8Array([0, 1]),
    },
  };
  yield {
    type: "voice.audio.chunk",
    chunk: {
      streamId: "request-1",
      sequence: 1,
      sampleRate: 24_000,
      channels: 1,
      format: "pcm_s16le",
      isFinal: true,
      audio: new Uint8Array([2, 3]),
    },
  };
  yield { type: "voice.completed", metrics };
}

class SocketMock extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public readonly sent: Array<{ binary: boolean; data: Buffer | string }> = [];
  public readonly closed: Array<{ code: number; reason: string }> = [];
  public pings = 0;
  public terminated = false;

  ping(): void {
    this.pings += 1;
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = WebSocket.CLOSED;
  }

  close(code: number, reason: string): void {
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
  }

  send(
    data: Buffer | string,
    options: { binary?: boolean },
    callback: (error?: Error | null) => void,
  ): void {
    this.sent.push({ data, binary: options.binary ?? false });
    // Так зовёт колбэк сам ws при успешной отправке.
    callback(null);
  }
}

const asSocket = (socket: SocketMock): WebSocket =>
  socket as unknown as WebSocket;

const message = (value: unknown): RawData =>
  Buffer.from(JSON.stringify(value), "utf8");

const textEvents = (socket: SocketMock) =>
  socket.sent.flatMap(({ data }) =>
    typeof data === "string"
      ? [VoicePipelineServerEventSchema.parse(JSON.parse(data))]
      : [],
  );

const authenticatedUser = {
  sub: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
  email: "operator@example.test",
  role: "operator" as const,
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

const handshake = (authorization?: string) =>
  ({ headers: { authorization } }) as unknown as IncomingMessage;

const snapshot: CallSnapshot & {
  openingLine: string;
  openingTurn: {
    text: string;
    voice: VoicePipelineRequest["voice"];
    minimumResponseDelayMs: number;
  };
} = {
  trainingSessionId: "session-1",
  scenarioVersionId: "version-1",
  scenarioCode: "S-015",
  title: "Пожар в жилом доме",
  stage: "conversation",
  panicLevel: 3,
  revealedFactKeys: [],
  checklistTotal: 6,
  checklistSatisfied: 0,
  locator: null,
  offeredAt: new Date("2026-09-08T10:00:00.000Z"),
  answeredAt: null,
  endedAt: null,
  answerNormSeconds: 240,
  openingLine: "Горит квартира!",
  openingTurn: {
    text: "Горит квартира!",
    voice: request.voice,
    minimumResponseDelayMs: 0,
  },
};

const heard: AsrTranscript = {
  transcript: "Что произошло?",
  audioMs: 1_500,
  processingMs: 120,
};

interface AsrMocks {
  open: jest.Mock;
  send: jest.Mock;
  onTranscript: jest.Mock;
  finish: jest.Mock;
  abort: jest.Mock;
}

const createAsr = (
  finish: jest.Mock = jest.fn().mockResolvedValue(heard),
): { asr: AsrStreamer; mocks: AsrMocks } => {
  const mocks: AsrMocks = {
    open: jest.fn(),
    send: jest.fn(),
    onTranscript: jest.fn(),
    finish,
    abort: jest.fn(),
  };
  const stream: AsrStreamHandle = {
    sessionId: "asr-session-1",
    send: mocks.send,
    onTranscript: mocks.onTranscript,
    finish: mocks.finish as unknown as AsrStreamHandle["finish"],
    abort: mocks.abort,
  };

  mocks.open.mockResolvedValue(stream);

  return { asr: { open: mocks.open }, mocks };
};

interface RecorderMocks {
  startCall: jest.Mock;
  resumeCall: jest.Mock;
  openSegment: jest.Mock;
  finishCall: jest.Mock;
  write: jest.Mock;
  close: jest.Mock;
}

const createRecorder = (): {
  recorder: CallRecorder;
  mocks: RecorderMocks;
} => {
  const write = jest.fn();
  const close = jest.fn();
  const segment: RecordingSegment = { write, close };
  const mocks: RecorderMocks = {
    startCall: jest.fn(),
    resumeCall: jest.fn(),
    openSegment: jest.fn().mockReturnValue(segment),
    finishCall: jest.fn(),
    write,
    close,
  };

  return {
    recorder: {
      startCall: mocks.startCall,
      resumeCall: mocks.resumeCall,
      openSegment: mocks.openSegment,
      finishCall: mocks.finishCall,
    } as unknown as CallRecorder,
    mocks,
  };
};

const createCards = () =>
  ({
    close: jest.fn().mockResolvedValue(undefined),
  }) as unknown as import("@/modules/incident-card").IncidentCardService;

const createTraining = (overrides: Record<string, jest.Mock> = {}) => {
  const mocks = {
    reserveAttempt: jest.fn().mockResolvedValue(1),
    activateAttempt: jest.fn().mockResolvedValue(undefined),
    finishAttempt: jest.fn().mockResolvedValue(true),
    auditInstructorEnd: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return mocks as typeof mocks & TrainingService;
};

const createEngine = (overrides: Record<string, jest.Mock> = {}) =>
  ({
    startCall: jest.fn().mockResolvedValue({ ...snapshot, stage: "offered" }),
    acceptCall: jest.fn().mockResolvedValue(snapshot),
    declineCall: jest
      .fn()
      .mockResolvedValue({ ...snapshot, stage: "declined" }),
    endCall: jest.fn().mockResolvedValue({ ...snapshot, stage: "ended" }),
    tick: jest.fn().mockResolvedValue([]),
    getSnapshot: jest.fn().mockResolvedValue(snapshot),
    renewRecoveryLease: jest.fn().mockResolvedValue(true),
    claimRecoveryLease: jest.fn().mockResolvedValue(false),
    listRecoveryLeases: jest.fn().mockResolvedValue([]),
    claimExpiredRecoveryLease: jest.fn().mockResolvedValue(false),
    getRecentTurns: jest.fn().mockResolvedValue([
      { role: "operator", text: "Что произошло?" },
      { role: "caller", text: "На кухне пожар." },
    ]),
    setOperatorSpeaking: jest.fn().mockResolvedValue(undefined),
    setCallerSpeaking: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ScenarioEngineService;

const createMetrics = () => ({
  sessionOpened: jest.fn(),
  sessionClosed: jest.fn(),
  callerReplyGenerated: jest.fn(),
  turnCompleted: jest.fn(),
  turnFailed: jest.fn(),
});

const startedCall = async (
  gateway: VoicePipelineGateway,
  socket: SocketMock,
  channel: "voice" | "text" = "voice",
): Promise<void> => {
  await gateway.handleClientMessage(
    asSocket(socket),
    message({
      type: "start",
      scenarioVersionId: "version-1",
      assignmentId: "assignment-1",
      channel,
    }),
    false,
  );
};

const createRuntime = async (
  stream: StreamFactory = successfulStream,
  verify: jest.Mock = jest.fn().mockResolvedValue(authenticatedUser),
  recordReply: jest.Mock = jest.fn().mockResolvedValue(undefined),
  engine: ScenarioEngineService = createEngine(),
  asr: { asr: AsrStreamer; mocks: AsrMocks } = createAsr(),
  recording: {
    recorder: CallRecorder;
    mocks: RecorderMocks;
  } = createRecorder(),
  cards = createCards(),
  training = createTraining(),
  channel: "voice" | "text" = "voice",
) => {
  const streamReply = jest.fn(
    (input: VoicePipelineRequest, signal: AbortSignal) => stream(input, signal),
  );
  const streamPrescribedSpeech = jest.fn(
    (
      input: PrescribedSpeechRequest,
    ): AsyncIterable<SpeechSynthesisStreamEvent> =>
      (async function* () {
        const audio = new Uint8Array([4, 5]);
        yield {
          type: "audio.chunk" as const,
          chunk: {
            streamId: input.requestId,
            sequence: 0,
            sampleRate: 24_000,
            channels: 1 as const,
            format: "pcm_s16le" as const,
            isFinal: true,
            audio,
          },
        };
        yield {
          type: "synthesis.completed" as const,
          metrics: {
            timeToFirstAudioMs: 0,
            durationMs: 0,
            chunkCount: 1,
            audioBytes: audio.byteLength,
            attempts: [
              { attempt: 1, durationMs: 0, outcome: "success" as const },
            ],
          },
        };
      })(),
  );
  const create = jest.fn(async () => request);
  const metrics = createMetrics();
  const gateway = new VoicePipelineGateway(
    { streamReply, streamPrescribedSpeech } as unknown as VoicePipelineService,
    { create, recordReply } as unknown as VoicePipelineRequestFactory,
    { verify } as unknown as AccessTokenVerifier,
    engine,
    asr.asr,
    recording.recorder,
    cards,
    training,
    metrics,
  );
  const socket = new SocketMock();
  await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
  // Все сценарии разговора идут после старта: speak до него отвергается.
  await startedCall(gateway, socket, channel);
  socket.sent.length = 0;

  return {
    asr: asr.mocks,
    recorder: recording.mocks,
    create,
    engine,
    gateway,
    metrics,
    recordReply,
    socket,
    streamPrescribedSpeech,
    streamReply,
    training,
    verify,
  };
};

describe(VoicePipelineGateway.name, () => {
  it("accepts a browser bearer token from the WebSocket protocols", () => {
    expect(
      websocketAuthorization({
        headers: { "sec-websocket-protocol": "bearer, browser-token" },
      } as IncomingMessage),
    ).toBe("Bearer browser-token");
  });

  it("prefers the Authorization header used by native clients", () => {
    expect(
      websocketAuthorization({
        headers: {
          authorization: "Bearer header-token",
          "sec-websocket-protocol": "bearer, browser-token",
        },
      } as IncomingMessage),
    ).toBe("Bearer header-token");
  });

  it("closes a handshake that carries no valid access token", async () => {
    const verify = jest.fn().mockResolvedValue(null);
    const streamReply = jest.fn();
    const gateway = new VoicePipelineGateway(
      { streamReply } as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      { verify } as unknown as AccessTokenVerifier,
      createEngine(),
      createAsr().asr,
      createRecorder().recorder,
      createCards(),
      createTraining(),
      createMetrics(),
    );
    const socket = new SocketMock();

    await gateway.handleConnection(asSocket(socket), handshake());

    expect(socket.closed).toEqual([{ code: 4401, reason: "Unauthorized" }]);

    // A command sent by a rejected client must not reach the pipeline.
    await gateway.handleClientMessage(
      asSocket(socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(streamReply).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
  });

  it("offers the call with the locator area and no exact address", async () => {
    const engine = createEngine();
    const gateway = new VoicePipelineGateway(
      { streamReply: jest.fn() } as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      {
        verify: jest.fn().mockResolvedValue(authenticatedUser),
      } as unknown as AccessTokenVerifier,
      engine,
      createAsr().asr,
      createRecorder().recorder,
      createCards(),
      createTraining(),
      createMetrics(),
    );
    const socket = new SocketMock();

    await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
    await startedCall(gateway, socket);

    const offered = textEvents(socket)[0];

    expect(offered.type).toBe("call.offered");
    // Идентификатор сессии выдаёт сервер, а не клиент.
    expect(offered.sessionId).toEqual(expect.any(String));
  });

  it("refuses to speak before the call has been started", async () => {
    const gateway = new VoicePipelineGateway(
      { streamReply: jest.fn() } as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      {
        verify: jest.fn().mockResolvedValue(authenticatedUser),
      } as unknown as AccessTokenVerifier,
      createEngine(),
      createAsr().asr,
      createRecorder().recorder,
      createCards(),
      createTraining(),
      createMetrics(),
    );
    const socket = new SocketMock();

    await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
    await gateway.handleClientMessage(
      asSocket(socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(textEvents(socket).map((event) => event.type)).toEqual(["error"]);
  });

  it("answers the call with the line the scenario scripted", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "accept" }),
      false,
    );

    const accepted = textEvents(runtime.socket)[0];

    expect(accepted).toMatchObject({
      type: "call.accepted",
      openingLine: "Горит квартира!",
      stage: "conversation",
    });
    expect(runtime.streamPrescribedSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Горит квартира!",
        voice: request.voice,
      }),
      expect.any(AbortSignal),
    );
    expect(textEvents(runtime.socket).map((event) => event.type)).toEqual([
      "call.accepted",
      "audio.start",
      "audio.done",
    ]);
  });

  it("ведёт текстовый разговор без синтеза речи и без микрофона", async () => {
    // Поток отвечает так же, как настоящий конвейер в текстовом режиме:
    // реплика словами и конец хода, без единого звукового кадра.
    const textStream = async function* (
      pipelineRequest: VoicePipelineRequest,
    ): AsyncIterable<VoicePipelineStreamEvent> {
      expect(pipelineRequest.textOnly).toBe(true);
      yield {
        type: "voice.reply.ready",
        result: { reply, source: "model", attempts },
        timeToReplyMs: 20,
      };
      yield {
        type: "voice.text.completed",
        metrics: {
          timeToReplyMs: 20,
          durationMs: 25,
          generation: { source: "model", attempts },
        },
      };
    };
    const runtime = await createRuntime(
      textStream,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "text",
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "accept" }),
      false,
    );

    // Первая реплика приходит текстом в самом `call.accepted`.
    expect(textEvents(runtime.socket).map((event) => event.type)).toEqual([
      "call.accepted",
    ]);
    expect(runtime.streamPrescribedSpeech).not.toHaveBeenCalled();

    runtime.socket.sent.length = 0;
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(textEvents(runtime.socket).map((event) => event.type)).toEqual([
      "reply.text",
      "reply.done",
    ]);
    // Звук клиенту не уходит: двоичных кадров в текстовом разговоре нет.
    expect(runtime.socket.sent.some(({ binary }) => binary)).toBe(false);

    runtime.socket.sent.length = 0;
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );

    expect(textEvents(runtime.socket)[0]).toMatchObject({
      type: "error",
      code: "text-channel-only",
    });
    expect(runtime.asr.open).not.toHaveBeenCalled();
  });

  it("reports a refused lifecycle command instead of failing silently", async () => {
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      undefined,
      createEngine({
        acceptCall: jest
          .fn()
          .mockRejectedValue(
            new ScenarioEngineError("call-stage-forbidden", "not now"),
          ),
      }),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "accept" }),
      false,
    );

    expect(textEvents(runtime.socket)[0]).toMatchObject({
      type: "error",
      code: "call-state-invalid",
    });
  });

  it("reports a changed step while the operator stays silent", async () => {
    const agitated = { ...snapshot, panicLevel: 4 };
    const engine = createEngine({
      getSnapshot: jest.fn().mockResolvedValue(agitated),
    });
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      undefined,
      engine,
    );

    await runtime.gateway.advanceCall(asSocket(runtime.socket));

    expect(engine.tick).toHaveBeenCalled();
    expect(textEvents(runtime.socket)[0]).toMatchObject({
      type: "call.state",
      panicLevel: 4,
    });
  });

  it("stays quiet while nothing about the call changes", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.advanceCall(asSocket(runtime.socket));
    await runtime.gateway.advanceCall(asSocket(runtime.socket));

    // Раз в секунду слать один и тот же снимок — шум и в сети, и в отладке.
    expect(
      textEvents(runtime.socket).filter((event) => event.type === "call.state"),
    ).toHaveLength(1);
  });

  it("stops advancing a call that has ended", async () => {
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      undefined,
      createEngine({
        getSnapshot: jest
          .fn()
          .mockResolvedValue({ ...snapshot, stage: "ended" }),
      }),
    );

    await runtime.gateway.advanceCall(asSocket(runtime.socket));

    expect(textEvents(runtime.socket)).toEqual([]);
  });

  it("speaks on the caller's own initiative when the operator goes quiet", async () => {
    const engine = createEngine({
      tick: jest
        .fn()
        .mockResolvedValue([
          { type: "caller.initiative", reason: "operator-silence" },
        ]),
    });
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      undefined,
      engine,
    );

    await runtime.gateway.advanceCall(asSocket(runtime.socket));

    // Реплики оператора не было: движок получает флаг, чтобы не записать её.
    expect(runtime.create).toHaveBeenCalledWith(
      expect.objectContaining({ initiative: true }),
    );
    expect(runtime.recordReply).toHaveBeenCalledWith(
      expect.objectContaining({ initiative: true }),
    );
    expect(textEvents(runtime.socket).map((event) => event.type)).toContain(
      "reply.text",
    );
  });

  it("skips the initiative while a request is already running", async () => {
    const engine = createEngine({
      tick: jest
        .fn()
        .mockResolvedValue([
          { type: "caller.initiative", reason: "operator-silence" },
        ]),
    });
    // Поток, который висит до отмены: занимает канал на время проверки.
    const busyStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    const runtime = await createRuntime(
      busyStream,
      undefined,
      undefined,
      engine,
    );

    const pending = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    await runtime.gateway.advanceCall(asSocket(runtime.socket));

    // К моменту, когда канал освободится, повод молчать уже исчезнет.
    expect(runtime.create).toHaveBeenCalledTimes(1);

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "cancel" }),
      false,
    );
    await pending;
  });

  it("streams reply metadata, zero-copy ordered PCM, and completion", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({
        type: "speak",
        operatorText: "Что произошло?",
        voiceId: "Vivian",
      }),
      false,
    );

    expect(runtime.create).toHaveBeenCalledWith({
      command: {
        type: "speak",
        operatorText: "Что произошло?",
        voiceId: "Vivian",
      },
      requestId: expect.any(String),
      sessionId: expect.any(String),
      signal: expect.any(AbortSignal),
      initiative: false,
    });
    expect(runtime.streamReply).toHaveBeenCalledWith(
      request,
      expect.any(AbortSignal),
      expect.any(Number),
    );

    expect(runtime.socket.sent.map(({ binary }) => binary)).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(
      runtime.socket.sent
        .filter(({ binary }) => binary)
        .map(({ data }) => [...(data as Buffer)]),
    ).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "reply.text",
      "audio.start",
      "audio.done",
    ]);
    expect(runtime.engine.setCallerSpeaking).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ speaking: true }),
    );
    expect(runtime.engine.setCallerSpeaking).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ speaking: false }),
    );
    // Мониторинг видит, кто написал реплику и сколько оператор ждал звука.
    expect(runtime.metrics.callerReplyGenerated).toHaveBeenCalledTimes(1);
    expect(runtime.metrics.turnCompleted).toHaveBeenCalledWith(
      "generated",
      expect.any(Number),
    );
    expect(runtime.metrics.turnFailed).not.toHaveBeenCalled();
  });

  it("counts an open session and closes it on disconnect", async () => {
    const runtime = await createRuntime();

    expect(runtime.metrics.sessionOpened).toHaveBeenCalledTimes(1);

    runtime.gateway.handleDisconnect(asSocket(runtime.socket));

    expect(runtime.metrics.sessionClosed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: Buffer.from("not-json"), binary: false },
    { data: message({ type: "speak", operatorText: "" }), binary: false },
    {
      data: Buffer.alloc(16_385, "a"),
      binary: false,
    },
  ])(
    "rejects an invalid command without invoking the pipeline",
    async (input) => {
      const runtime = await createRuntime();

      await runtime.gateway.handleClientMessage(
        asSocket(runtime.socket),
        input.data,
        input.binary,
      );

      expect(runtime.create).not.toHaveBeenCalled();
      expect(runtime.streamReply).not.toHaveBeenCalled();
      expect(textEvents(runtime.socket)).toEqual([
        expect.objectContaining({
          type: "error",
          code: "invalid-message",
          requestId: null,
        }),
      ]);
    },
  );

  it("returns facts to the engine before the reply reaches the client", async () => {
    const recordReply = jest.fn().mockResolvedValue(undefined);
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      recordReply,
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(recordReply).toHaveBeenCalledWith(
      expect.objectContaining({ operatorText: "Что произошло?" }),
    );
    expect(textEvents(runtime.socket).map((event) => event.type)).toContain(
      "reply.text",
    );
  });

  it("drops a reply the engine refuses instead of speaking it", async () => {
    const recordReply = jest
      .fn()
      .mockRejectedValue(new Error("fact not allowed"));
    const runtime = await createRuntime(
      successfulStream,
      undefined,
      recordReply,
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    const types = textEvents(runtime.socket).map((event) => event.type);

    // A reply that revealed something the scenario withheld must not reach the
    // operator, and no audio may be sent for it.
    expect(types).not.toContain("reply.text");
    expect(types).toContain("error");
    expect(runtime.socket.sent.some((frame) => frame.binary)).toBe(false);
  });

  it("sanitizes context creation failures", async () => {
    const runtime = await createRuntime();
    runtime.create.mockRejectedValueOnce(
      new Error("scenario database password and hidden facts"),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(textEvents(runtime.socket)).toEqual([
      expect.objectContaining({
        type: "error",
        code: "context-unavailable",
        message: "Voice pipeline context is unavailable",
      }),
    ]);
    expect(JSON.stringify(runtime.socket.sent)).not.toContain("password");
  });

  it("sanitizes pipeline failures", async () => {
    const failingStream = (
      _request: VoicePipelineRequest,
      _signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        throw new Error("provider response with sensitive transcript");
      });
    const runtime = await createRuntime(failingStream);

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(textEvents(runtime.socket)).toEqual([
      expect.objectContaining({
        type: "error",
        code: "pipeline-failed",
        message: "Voice pipeline request failed",
      }),
    ]);
    expect(JSON.stringify(runtime.socket.sent)).not.toContain("sensitive");
  });

  it("aborts an active request on cancel without emitting a failure", async () => {
    let observedSignal: AbortSignal | undefined;
    let markStreamStarted!: () => void;
    const streamStarted = new Promise<void>((resolve) => {
      markStreamStarted = resolve;
    });
    const waitingStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        observedSignal = signal;
        markStreamStarted();
        signal.throwIfAborted();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    const runtime = await createRuntime(waitingStream);

    const active = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );
    await streamStarted;
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "cancel" }),
      false,
    );
    await active;

    expect(observedSignal?.aborted).toBe(true);
    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "request.cancelled",
    ]);
    expect(runtime.engine.setCallerSpeaking).toHaveBeenLastCalledWith(
      expect.objectContaining({ speaking: false }),
    );
  });

  it("lets recognised speech take the floor from an active caller reply", async () => {
    let markStreamStarted!: () => void;
    const streamStarted = new Promise<void>((resolve) => {
      markStreamStarted = resolve;
    });
    const waitingStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        markStreamStarted();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    let streamNumber = 0;
    const runtime = await createRuntime((request, signal) =>
      streamNumber++ === 0
        ? waitingStream(request, signal)
        : successfulStream(request, signal),
    );
    const active = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );
    await streamStarted;

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );

    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "listen.started",
    ]);

    const onTranscript = runtime.asr.onTranscript.mock.calls[0]?.[0] as
      ((transcript: AsrTranscript) => void) | undefined;
    onTranscript?.(heard);
    await active;
    await new Promise((resolve) => setImmediate(resolve));

    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "listen.started",
      "listen.transcript",
      "request.cancelled",
      "reply.text",
      "audio.start",
      "audio.done",
    ]);
  });

  it("does not start the pipeline when cancellation wins context creation", async () => {
    let releaseContext!: (value: VoicePipelineRequest) => void;
    const runtime = await createRuntime();
    runtime.create.mockImplementationOnce(
      () =>
        new Promise<VoicePipelineRequest>((resolve) => {
          releaseContext = resolve;
        }),
    );

    const active = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );
    await Promise.resolve();
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "cancel" }),
      false,
    );
    releaseContext(request);
    await active;

    expect(runtime.streamReply).not.toHaveBeenCalled();
    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "request.cancelled",
    ]);
  });

  it("aborts work when the client disconnects", async () => {
    let observedSignal: AbortSignal | undefined;
    let markStreamStarted!: () => void;
    const streamStarted = new Promise<void>((resolve) => {
      markStreamStarted = resolve;
    });
    const waitingStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        observedSignal = signal;
        markStreamStarted();
        signal.throwIfAborted();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    const runtime = await createRuntime(waitingStream);
    const active = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );
    await streamStarted;

    runtime.gateway.handleDisconnect(asSocket(runtime.socket));
    await active;

    expect(observedSignal?.aborted).toBe(true);
    expect(runtime.socket.sent).toEqual([]);
  });
  it("answers the operator's voice without a separate speak command", async () => {
    const runtime = await createRuntime();
    const frame = Buffer.from([1, 2, 3, 4]);

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      frame,
      true,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    expect(runtime.asr.send).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(Buffer.from(runtime.asr.send.mock.calls[0]?.[0])).toEqual(frame);

    const types = textEvents(runtime.socket).map((event) => event.type);
    expect(types).toEqual([
      "listen.started",
      "listen.stopped",
      "reply.text",
      "audio.start",
      "audio.done",
    ]);

    // Ход делает сервер: клиент не присылал ни строчки текста.
    expect(runtime.create).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { type: "speak", operatorText: heard.transcript },
      }),
    );
  });

  it("does not pause the silence timer merely because the microphone is open", async () => {
    const engine = createEngine();
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      engine,
    );
    const speaking = engine.setOperatorSpeaking as unknown as jest.Mock;

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );

    expect(speaking).not.toHaveBeenCalledWith(
      expect.objectContaining({ speaking: true }),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    expect(speaking).toHaveBeenLastCalledWith(
      expect.objectContaining({ speaking: false }),
    );
  });

  it("drops audio that arrives outside a listen window", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      Buffer.from([1, 2]),
      true,
    );

    expect(runtime.asr.send).not.toHaveBeenCalled();
    // Ошибка на каждый кадр превратилась бы в поток ошибок.
    expect(runtime.socket.sent).toEqual([]);
  });

  it("makes no turn out of an utterance nobody could hear", async () => {
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      createEngine(),
      createAsr(
        jest.fn().mockResolvedValue({
          transcript: "  ",
          audioMs: 300,
          processingMs: 40,
        }),
      ),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    expect(textEvents(runtime.socket).map((event) => event.type)).toEqual([
      "listen.started",
      "listen.stopped",
    ]);
    expect(runtime.streamReply).not.toHaveBeenCalled();
  });

  it("reports a lost utterance instead of answering a half of it", async () => {
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      createEngine(),
      createAsr(jest.fn().mockRejectedValue(new Error("decoder is busy"))),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    const events = textEvents(runtime.socket);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "listen-failed",
    });
    expect(runtime.streamReply).not.toHaveBeenCalled();
  });

  it("abandons the previous utterance when the operator starts over", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );

    expect(runtime.asr.abort).toHaveBeenCalledTimes(1);
    expect(runtime.asr.open).toHaveBeenCalledTimes(2);
  });

  it("refuses to listen before the call has been started", async () => {
    const { asr, mocks } = createAsr();
    const gateway = new VoicePipelineGateway(
      { streamReply: jest.fn() } as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      {
        verify: jest.fn().mockResolvedValue(authenticatedUser),
      } as unknown as AccessTokenVerifier,
      createEngine(),
      asr,
      createRecorder().recorder,
      createCards(),
      createTraining(),
      createMetrics(),
    );
    const socket = new SocketMock();

    await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
    await gateway.handleClientMessage(
      asSocket(socket),
      message({ type: "listen.start" }),
      false,
    );

    expect(mocks.open).not.toHaveBeenCalled();
    expect(textEvents(socket)).toMatchObject([
      { type: "error", code: "call-state-invalid" },
    ]);
  });

  it("closes an open utterance when the client disconnects", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    runtime.gateway.handleDisconnect(asSocket(runtime.socket));

    expect(runtime.asr.abort).toHaveBeenCalledTimes(1);
  });

  it("ends the call when the operator's connection drops", async () => {
    jest.useFakeTimers();
    const engine = createEngine();
    const cards = createCards();
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      engine,
      createAsr(),
      createRecorder(),
      cards,
    );

    try {
      runtime.gateway.handleDisconnect(asSocket(runtime.socket));
      expect(engine.endCall).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(engine.endCall).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "disconnected" }),
      );
      expect(cards.close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("resumes the same active session during the recovery window", async () => {
    jest.useFakeTimers();
    const engine = createEngine();

    try {
      const runtime = await createRuntime(
        successfulStream,
        jest.fn().mockResolvedValue(authenticatedUser),
        jest.fn().mockResolvedValue(undefined),
        engine,
      );
      const sessionId = (engine.startCall as jest.Mock).mock.calls[0]?.[0]
        .trainingSessionId as string;

      runtime.gateway.handleDisconnect(asSocket(runtime.socket));
      jest.advanceTimersByTime(5_000);

      const resumedSocket = new SocketMock();
      await runtime.gateway.handleConnection(
        asSocket(resumedSocket),
        handshake("Bearer token"),
      );
      await runtime.gateway.handleClientMessage(
        asSocket(resumedSocket),
        message({ type: "resume", sessionId, resumeListening: true }),
        false,
      );

      expect(textEvents(resumedSocket)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "call.resumed",
            sessionId,
            stage: "conversation",
          }),
          expect.objectContaining({ type: "listen.started", sessionId }),
        ]),
      );
      jest.advanceTimersByTime(30_000);
      expect(engine.endCall).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("resumes an active session from its persisted lease after backend restart", async () => {
    const sessionId = "2f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f";
    const answeredAt = new Date("2026-09-15T20:00:00.000Z");
    const engine = createEngine({
      claimRecoveryLease: jest.fn().mockResolvedValue(true),
      getSnapshot: jest.fn().mockResolvedValue({ ...snapshot, answeredAt }),
    });
    const recording = createRecorder();
    const gateway = new VoicePipelineGateway(
      {} as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      {
        verify: jest.fn().mockResolvedValue(authenticatedUser),
      } as unknown as AccessTokenVerifier,
      engine,
      createAsr().asr,
      recording.recorder,
      createCards(),
      createTraining(),
      createMetrics(),
    );
    const socket = new SocketMock();

    await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
    await gateway.handleClientMessage(
      asSocket(socket),
      message({ type: "resume", sessionId, resumeListening: false }),
      false,
    );

    expect(engine.claimRecoveryLease).toHaveBeenCalledWith(
      sessionId,
      authenticatedUser.sub,
      expect.any(Date),
      expect.any(Date),
    );
    expect(textEvents(socket)).toContainEqual(
      expect.objectContaining({ type: "call.resumed", sessionId }),
    );
    expect(recording.mocks.resumeCall).toHaveBeenCalledWith(
      sessionId,
      answeredAt,
    );
  });

  it("finishes an unclaimed persisted session after restart grace expires", async () => {
    jest.useFakeTimers();
    const sessionId = "3f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f";
    const engine = createEngine({
      listRecoveryLeases: jest.fn().mockResolvedValue([
        {
          trainingSessionId: sessionId,
          expiresAt: new Date(Date.now() + 5_000),
        },
      ]),
      claimExpiredRecoveryLease: jest.fn().mockResolvedValue(true),
    });
    const training = createTraining();
    const cards = createCards();
    const gateway = new VoicePipelineGateway(
      {} as unknown as VoicePipelineService,
      {
        create: jest.fn(),
        recordReply: jest.fn(),
      } as unknown as VoicePipelineRequestFactory,
      {
        verify: jest.fn().mockResolvedValue(authenticatedUser),
      } as unknown as AccessTokenVerifier,
      engine,
      createAsr().asr,
      createRecorder().recorder,
      cards,
      training,
      createMetrics(),
    );

    try {
      await gateway.onModuleInit();
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(engine.claimExpiredRecoveryLease).toHaveBeenCalledWith(
        sessionId,
        expect.any(Date),
        expect.any(Date),
      );
      expect(engine.endCall).toHaveBeenCalledWith(
        expect.objectContaining({ trainingSessionId: sessionId }),
      );
      expect(cards.close).toHaveBeenCalledWith(sessionId);
      expect(training.finishAttempt).toHaveBeenCalledWith(
        sessionId,
        "abandoned",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps a failed recovery timer bound to the old session", async () => {
    jest.useFakeTimers();
    const engine = createEngine({
      getSnapshot: jest.fn().mockRejectedValue(new Error("db read failed")),
    });

    try {
      const runtime = await createRuntime(
        successfulStream,
        jest.fn().mockResolvedValue(authenticatedUser),
        jest.fn().mockResolvedValue(undefined),
        engine,
      );
      const oldSessionId = (engine.startCall as jest.Mock).mock.calls[0]?.[0]
        .trainingSessionId as string;
      runtime.gateway.handleDisconnect(asSocket(runtime.socket));

      const resumedSocket = new SocketMock();
      await runtime.gateway.handleConnection(
        asSocket(resumedSocket),
        handshake("Bearer token"),
      );
      await runtime.gateway.handleClientMessage(
        asSocket(resumedSocket),
        message({
          type: "resume",
          sessionId: oldSessionId,
          resumeListening: false,
        }),
        false,
      );
      await runtime.gateway.handleClientMessage(
        asSocket(resumedSocket),
        message({
          type: "start",
          scenarioVersionId: "version-1",
          assignmentId: "assignment-1",
        }),
        false,
      );

      const newSessionId = (engine.startCall as jest.Mock).mock.calls[1]?.[0]
        .trainingSessionId as string;
      expect(newSessionId).not.toBe(oldSessionId);

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.endCall).toHaveBeenCalledWith(
        expect.objectContaining({ trainingSessionId: oldSessionId }),
      );
      expect(engine.endCall).not.toHaveBeenCalledWith(
        expect.objectContaining({ trainingSessionId: newSessionId }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the recovered socket when the dropped one closes late", async () => {
    jest.useFakeTimers();
    const engine = createEngine({
      endCallByInstructor: jest
        .fn()
        .mockResolvedValue({ ...snapshot, stage: "ended" }),
    });

    try {
      const runtime = await createRuntime(
        successfulStream,
        jest.fn().mockResolvedValue(authenticatedUser),
        jest.fn().mockResolvedValue(undefined),
        engine,
      );
      const sessionId = (engine.startCall as jest.Mock).mock.calls[0]?.[0]
        .trainingSessionId as string;

      runtime.gateway.handleDisconnect(asSocket(runtime.socket));

      const resumedSocket = new SocketMock();
      await runtime.gateway.handleConnection(
        asSocket(resumedSocket),
        handshake("Bearer token"),
      );
      await runtime.gateway.handleClientMessage(
        asSocket(resumedSocket),
        message({ type: "resume", sessionId, resumeListening: false }),
        false,
      );

      // Обрыв старого сокета мог дойти до сервера уже после восстановления.
      runtime.gateway.handleDisconnect(asSocket(runtime.socket));

      await runtime.gateway.endSessionByInstructor(
        sessionId,
        "9f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
        "instructor stopped the drill",
      );

      expect(textEvents(resumedSocket)).toContainEqual(
        expect.objectContaining({ type: "call.ended", reason: "instructor" }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not expire a session recovered from its persisted lease", async () => {
    jest.useFakeTimers();
    const engine = createEngine({
      claimRecoveryLease: jest.fn().mockResolvedValue(true),
    });

    try {
      const runtime = await createRuntime(
        successfulStream,
        jest.fn().mockResolvedValue(authenticatedUser),
        jest.fn().mockResolvedValue(undefined),
        engine,
      );
      const sessionId = (engine.startCall as jest.Mock).mock.calls[0]?.[0]
        .trainingSessionId as string;

      runtime.gateway.handleDisconnect(asSocket(runtime.socket));
      // Клиент вернулся по сохранённой lease, а не по живой памяти процесса.
      (
        runtime.gateway as unknown as {
          recoverableSessions: Map<string, unknown>;
        }
      ).recoverableSessions.delete(sessionId);

      const resumedSocket = new SocketMock();
      await runtime.gateway.handleConnection(
        asSocket(resumedSocket),
        handshake("Bearer token"),
      );
      await runtime.gateway.handleClientMessage(
        asSocket(resumedSocket),
        message({ type: "resume", sessionId, resumeListening: false }),
        false,
      );

      expect(textEvents(resumedSocket)).toContainEqual(
        expect.objectContaining({ type: "call.resumed", sessionId }),
      );

      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(engine.endCall).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not let another operator recover the session", async () => {
    jest.useFakeTimers();
    const engine = createEngine();
    const verify = jest
      .fn()
      .mockResolvedValueOnce(authenticatedUser)
      .mockResolvedValueOnce({
        ...authenticatedUser,
        sub: "1f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
        email: "another-operator@example.test",
      });

    try {
      const runtime = await createRuntime(
        successfulStream,
        verify,
        jest.fn().mockResolvedValue(undefined),
        engine,
      );
      const sessionId = (engine.startCall as jest.Mock).mock.calls[0]?.[0]
        .trainingSessionId as string;
      runtime.gateway.handleDisconnect(asSocket(runtime.socket));

      const otherSocket = new SocketMock();
      await runtime.gateway.handleConnection(
        asSocket(otherSocket),
        handshake("Bearer other-token"),
      );
      await runtime.gateway.handleClientMessage(
        asSocket(otherSocket),
        message({ type: "resume", sessionId, resumeListening: false }),
        false,
      );

      expect(textEvents(otherSocket)).toContainEqual(
        expect.objectContaining({
          type: "error",
          code: "session-recovery-unavailable",
        }),
      );
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.endCall).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says nothing when the socket drops right after a normal end", async () => {
    const engine = createEngine({
      endCall: jest
        .fn()
        .mockRejectedValue(
          new ScenarioEngineError("call-stage-forbidden", "already ended"),
        ),
    });
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      engine,
    );

    runtime.gateway.handleDisconnect(asSocket(runtime.socket));
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("keeps a very long utterance inside the contract", async () => {
    const longUtterance = "а".repeat(5_000);
    const runtime = await createRuntime(
      successfulStream,
      jest.fn().mockResolvedValue(authenticatedUser),
      jest.fn().mockResolvedValue(undefined),
      createEngine(),
      createAsr(
        jest.fn().mockResolvedValue({
          transcript: longUtterance,
          audioMs: 90_000,
          processingMs: 4_000,
        }),
      ),
    );

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    // Событие разбирается схемой, которая бросает: без обрезки оператор
    // остался бы и без расшифровки, и без ответа заявителя.
    const stopped = textEvents(runtime.socket).find(
      (event) => event.type === "listen.stopped",
    );

    expect(stopped).toMatchObject({
      transcript: longUtterance.slice(0, 4_000),
    });
  });

  it("records the operator's voice as well as recognising it", async () => {
    const runtime = await createRuntime();
    const frame = Buffer.from([1, 2, 3, 4]);

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.start" }),
      false,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      frame,
      true,
    );
    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "listen.stop" }),
      false,
    );

    expect(runtime.recorder.openSegment).toHaveBeenCalledWith(
      expect.objectContaining({ track: "operator", sampleRate: 16_000 }),
    );
    expect(Buffer.from(runtime.recorder.write.mock.calls[0]?.[0])).toEqual(
      frame,
    );
    expect(runtime.recorder.close).toHaveBeenCalled();
  });

  it("records the caller's reply as the operator hears it", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );

    expect(runtime.recorder.openSegment).toHaveBeenCalledWith(
      expect.objectContaining({ track: "caller", sampleRate: 24_000 }),
    );
    // Обе порции синтеза, ровно те же байты, что ушли клиенту.
    expect(runtime.recorder.write).toHaveBeenCalledTimes(2);
    expect(runtime.recorder.close).toHaveBeenCalledTimes(1);
  });

  it("records from the answered call to the end of it", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "accept" }),
      false,
    );

    expect(runtime.recorder.startCall).toHaveBeenCalledTimes(1);

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "end" }),
      false,
    );

    expect(runtime.recorder.finishCall).toHaveBeenCalledTimes(1);
  });

  it("closes the recording when the client disappears mid-call", async () => {
    jest.useFakeTimers();
    try {
      const runtime = await createRuntime();

      runtime.gateway.handleDisconnect(asSocket(runtime.socket));
      expect(runtime.recorder.finishCall).not.toHaveBeenCalled();
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(runtime.recorder.finishCall).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("drops a client that stopped answering", async () => {
    jest.useFakeTimers();

    try {
      const runtime = await createRuntime();

      jest.advanceTimersByTime(15_000);
      expect(runtime.socket.pings).toBe(1);

      // Ответа на ping не было: соединение брошено.
      jest.advanceTimersByTime(15_000);
      expect(runtime.socket.terminated).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps a client that answers the heartbeat", async () => {
    jest.useFakeTimers();

    try {
      const runtime = await createRuntime();

      jest.advanceTimersByTime(15_000);
      runtime.socket.emit("pong");
      jest.advanceTimersByTime(15_000);

      expect(runtime.socket.terminated).toBe(false);
      expect(runtime.socket.pings).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
  it("does not call a delivered frame a failure", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

    try {
      const runtime = await createRuntime();

      await runtime.gateway.handleClientMessage(
        asSocket(runtime.socket),
        message({ type: "speak", operatorText: "Что произошло?" }),
        false,
      );

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("gives every call its own training session", async () => {
    const runtime = await createRuntime();

    await runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "decline" }),
      false,
    );

    const first = textEvents(runtime.socket).at(-1)?.sessionId;

    await startedCall(runtime.gateway, runtime.socket);

    const offered = textEvents(runtime.socket).at(-1);

    expect(offered?.type).toBe("call.offered");
    // Соединение то же, звонок другой: журнал и запись принадлежат звонку.
    expect(offered?.sessionId).not.toBe(first);
    expect(runtime.recorder.finishCall).toHaveBeenCalledWith(first);
  });
  describe("training attempts", () => {
    const createStartGateway = (
      training: ReturnType<typeof createTraining>,
      engine: ScenarioEngineService = createEngine(),
      pipeline = {} as VoicePipelineService,
    ) =>
      new VoicePipelineGateway(
        pipeline,
        {
          create: jest.fn(),
          recordReply: jest.fn(),
        } as unknown as VoicePipelineRequestFactory,
        {
          verify: jest.fn().mockResolvedValue(authenticatedUser),
        } as unknown as AccessTokenVerifier,
        engine,
        createAsr().asr,
        createRecorder().recorder,
        createCards(),
        training,
        createMetrics(),
      );

    it("reserves the operator's attempt before the call exists", async () => {
      const runtime = await createRuntime();

      expect(runtime.training.reserveAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          assignmentId: "assignment-1",
          operatorId: authenticatedUser.sub,
          scenarioVersionId: "version-1",
        }),
      );
      expect(
        runtime.training.reserveAttempt.mock.invocationCallOrder[0],
      ).toBeLessThan(
        (runtime.engine.startCall as jest.Mock).mock.invocationCallOrder[0]!,
      );
    });

    it("does not consume an attempt when offline audio is not ready", async () => {
      const training = createTraining();
      const engine = createEngine();
      const gateway = createStartGateway(training, engine, {
        assertCanStart: jest
          .fn()
          .mockRejectedValue(new OfflineAudioNotReadyError()),
      } as unknown as VoicePipelineService);
      const socket = new SocketMock();
      await gateway.handleConnection(
        asSocket(socket),
        handshake("Bearer token"),
      );
      await startedCall(gateway, socket);
      expect(textEvents(socket).at(-1)).toMatchObject({
        type: "error",
        code: "scenario-audio-not-ready",
      });
      expect(training.reserveAttempt).not.toHaveBeenCalled();
      expect(engine.startCall).not.toHaveBeenCalled();
    });

    it.each([
      [
        ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED,
        "assignment-attempts-exhausted",
      ],
      [ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE, "assignment-attempt-active"],
      [ErrorCodes.ASSIGNMENT_NOT_AVAILABLE, "assignment-unavailable"],
    ] as const)(
      "tells the operator why %s refused the call",
      async (errorCode, socketCode) => {
        const engine = createEngine();
        const gateway = createStartGateway(
          createTraining({
            reserveAttempt: jest
              .fn()
              .mockRejectedValue(new AppConflictException(errorCode, "no")),
          }),
          engine,
        );
        const socket = new SocketMock();
        await gateway.handleConnection(
          asSocket(socket),
          handshake("Bearer token"),
        );

        await startedCall(gateway, socket);

        expect(textEvents(socket).at(-1)).toMatchObject({
          type: "error",
          code: socketCode,
        });
        expect(engine.startCall).not.toHaveBeenCalled();
      },
    );

    it("releases the reserved attempt when the call cannot start", async () => {
      const training = createTraining();
      const gateway = createStartGateway(
        training,
        createEngine({
          startCall: jest.fn().mockRejectedValue(new Error("db is down")),
        }),
      );
      const socket = new SocketMock();
      await gateway.handleConnection(
        asSocket(socket),
        handshake("Bearer token"),
      );

      await startedCall(gateway, socket);

      expect(training.finishAttempt).toHaveBeenCalledWith(
        training.reserveAttempt.mock.calls[0][0].trainingSessionId,
        "abandoned",
      );
    });

    it("ends the operator's call when the instructor intervenes", async () => {
      const endCallByInstructor = jest
        .fn()
        .mockResolvedValue({ ...snapshot, stage: "ended" });
      const runtime = await createRuntime(
        successfulStream,
        undefined,
        undefined,
        createEngine({ endCallByInstructor }),
      );
      const sessionId = runtime.training.reserveAttempt.mock.calls[0][0]
        .trainingSessionId as string;

      await runtime.gateway.endSessionByInstructor(
        sessionId,
        "instructor-1",
        "Время занятия вышло",
      );

      expect(endCallByInstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          trainingSessionId: sessionId,
          instructorId: "instructor-1",
          reason: "Время занятия вышло",
        }),
      );
      expect(textEvents(runtime.socket).at(-1)).toMatchObject({
        type: "call.ended",
        reason: "instructor",
      });
      expect(runtime.training.finishAttempt).toHaveBeenCalledWith(
        sessionId,
        "cancelled_by_instructor",
      );
      expect(runtime.training.auditInstructorEnd).toHaveBeenCalledWith(
        "instructor-1",
        sessionId,
        "Время занятия вышло",
      );
    });

    it("refuses to end a session that is already over", async () => {
      const runtime = await createRuntime(
        successfulStream,
        undefined,
        undefined,
        createEngine({
          endCallByInstructor: jest
            .fn()
            .mockRejectedValue(
              new ScenarioEngineError("call-stage-forbidden", "ended"),
            ),
        }),
      );
      runtime.training.finishAttempt.mockResolvedValue(false);

      const error = await runtime.gateway
        .endSessionByInstructor("session-x", "instructor-1", "stop")
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AppConflictException);
      expect(runtime.training.auditInstructorEnd).not.toHaveBeenCalled();
    });
  });
});
