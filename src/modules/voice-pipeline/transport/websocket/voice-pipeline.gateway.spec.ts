import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";

import WebSocket, { type RawData } from "ws";

import {
  VoicePipelineServerEventSchema,
  type VoicePipelineRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";

import type { AccessTokenVerifier } from "@/modules/auth/access-token.verifier";
import {
  ScenarioEngineError,
  type CallSnapshot,
  type ScenarioEngineService,
} from "@/modules/scenario-engine";

import type { VoicePipelineRequestFactory } from "../../application/voice-pipeline-request.factory";
import type { VoicePipelineService } from "../../application/voice-pipeline.service";
import { VoicePipelineGateway } from "./voice-pipeline.gateway";

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
  voiceId: "Vivian",
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

  close(code: number, reason: string): void {
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
  }

  send(
    data: Buffer | string,
    options: { binary?: boolean },
    callback: (error?: Error) => void,
  ): void {
    this.sent.push({ data, binary: options.binary ?? false });
    callback();
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

const snapshot: CallSnapshot & { openingLine: string } = {
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
    ...overrides,
  }) as unknown as ScenarioEngineService;

const startedCall = async (
  gateway: VoicePipelineGateway,
  socket: SocketMock,
): Promise<void> => {
  await gateway.handleClientMessage(
    asSocket(socket),
    message({ type: "start", scenarioVersionId: "version-1" }),
    false,
  );
};

const createRuntime = async (
  stream: StreamFactory = successfulStream,
  verify: jest.Mock = jest.fn().mockResolvedValue(authenticatedUser),
  recordReply: jest.Mock = jest.fn().mockResolvedValue(undefined),
  engine: ScenarioEngineService = createEngine(),
) => {
  const streamReply = jest.fn(
    (input: VoicePipelineRequest, signal: AbortSignal) => stream(input, signal),
  );
  const create = jest.fn(async () => request);
  const gateway = new VoicePipelineGateway(
    { streamReply } as unknown as VoicePipelineService,
    { create, recordReply } as unknown as VoicePipelineRequestFactory,
    { verify } as unknown as AccessTokenVerifier,
    engine,
  );
  const socket = new SocketMock();
  await gateway.handleConnection(asSocket(socket), handshake("Bearer token"));
  // Все сценарии разговора идут после старта: speak до него отвергается.
  await startedCall(gateway, socket);
  socket.sent.length = 0;

  return { create, engine, gateway, recordReply, socket, streamReply, verify };
};

describe(VoicePipelineGateway.name, () => {
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
    });
    expect(runtime.streamReply).toHaveBeenCalledWith(
      request,
      expect.any(AbortSignal),
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
  });

  it.each([
    { data: Buffer.from("not-json"), binary: false },
    { data: message({ type: "speak", operatorText: "" }), binary: false },
    { data: Buffer.from([0, 1]), binary: true },
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
});
