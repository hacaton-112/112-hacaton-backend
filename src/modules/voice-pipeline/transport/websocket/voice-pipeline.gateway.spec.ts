import { EventEmitter } from "node:events";

import WebSocket, { type RawData } from "ws";

import {
  VoicePipelineServerEventSchema,
  type VoicePipelineRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";

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
  public readyState = WebSocket.OPEN;
  public readonly sent: Array<{ binary: boolean; data: Buffer | string }> = [];

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

const createRuntime = (stream: StreamFactory = successfulStream) => {
  const streamReply = jest.fn(
    (input: VoicePipelineRequest, signal: AbortSignal) => stream(input, signal),
  );
  const create = jest.fn(async () => request);
  const gateway = new VoicePipelineGateway(
    { streamReply } as unknown as VoicePipelineService,
    { create } as VoicePipelineRequestFactory,
  );
  const socket = new SocketMock();
  gateway.handleConnection(asSocket(socket));

  return { create, gateway, socket, streamReply };
};

describe(VoicePipelineGateway.name, () => {
  it("streams reply metadata, zero-copy ordered PCM, and completion", async () => {
    const runtime = createRuntime();

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
      const runtime = createRuntime();

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

  it("sanitizes context creation failures", async () => {
    const runtime = createRuntime();
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
    const runtime = createRuntime(failingStream);

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
    const waitingStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        observedSignal = signal;
        signal.throwIfAborted();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    const runtime = createRuntime(waitingStream);

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
    await active;

    expect(observedSignal?.aborted).toBe(true);
    expect(textEvents(runtime.socket).map(({ type }) => type)).toEqual([
      "request.cancelled",
    ]);
  });

  it("aborts work when the client disconnects", async () => {
    let observedSignal: AbortSignal | undefined;
    const waitingStream = (
      _request: VoicePipelineRequest,
      signal: AbortSignal,
    ): AsyncIterable<VoicePipelineStreamEvent> =>
      failingIterable(async () => {
        observedSignal = signal;
        signal.throwIfAborted();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      });
    const runtime = createRuntime(waitingStream);
    const active = runtime.gateway.handleClientMessage(
      asSocket(runtime.socket),
      message({ type: "speak", operatorText: "Что произошло?" }),
      false,
    );
    await Promise.resolve();

    runtime.gateway.handleDisconnect(asSocket(runtime.socket));
    await active;

    expect(observedSignal?.aborted).toBe(true);
    expect(runtime.socket.sent).toEqual([]);
  });
});
