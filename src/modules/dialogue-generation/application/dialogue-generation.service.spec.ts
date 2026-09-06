import type {
  GenerateCallerReplyRequest,
  LlmStreamEvent,
} from "@/contracts";
import type { LlmPort } from "@/modules/ai-gateway";

import { CallerReplySafetyService } from "./caller-reply-safety.service";
import {
  DEFAULT_FALLBACK_CALLER_REPLY,
  DialogueGenerationService,
} from "./dialogue-generation.service";
import { LlmReplyStreamCollector } from "./llm-reply-stream.collector";

const validRequest: GenerateCallerReplyRequest = {
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
  },
};

const validReply = {
  text: "Горит кухня!",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
  revealedFactIds: ["fire_location"],
  endCall: false,
} as const;

type StreamFactory = () => AsyncIterable<LlmStreamEvent>;

class FakeLlmPort implements LlmPort {
  public readonly calls: GenerateCallerReplyRequest[] = [];

  constructor(private readonly streams: StreamFactory[]) {}

  streamReply(
    request: GenerateCallerReplyRequest,
    _signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    this.calls.push(request);
    const factory = this.streams[this.calls.length - 1];

    if (factory === undefined) {
      throw new Error("No fake stream configured for this attempt");
    }

    return factory();
  }
}

async function* replyStream(
  rawReply: string = JSON.stringify(validReply),
): AsyncIterable<LlmStreamEvent> {
  yield { type: "text.delta", delta: rawReply };
  yield { type: "response.completed" };
}

const failedStream: StreamFactory = () => {
  throw new Error("Provider unavailable");
};

const createService = (llmPort: LlmPort): DialogueGenerationService =>
  new DialogueGenerationService(
    llmPort,
    new LlmReplyStreamCollector(new CallerReplySafetyService()),
  );

describe(DialogueGenerationService.name, () => {
  it("returns the validated reply from the first attempt", async () => {
    const llmPort = new FakeLlmPort([replyStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.reply).toEqual(validReply);
    expect(result.source).toBe("model");
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: "success" }),
    ]);
    expect(llmPort.calls).toHaveLength(1);
  });

  it("retries an invalid response and returns the second valid reply", async () => {
    const llmPort = new FakeLlmPort([
      () => replyStream("{"),
      replyStream,
    ]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.source).toBe("model");
    expect(result.attempts.map(({ outcome }) => outcome)).toEqual([
      "invalid-response",
      "success",
    ]);
    expect(llmPort.calls).toHaveLength(2);
  });

  it("returns the fallback after two invalid responses", async () => {
    const llmPort = new FakeLlmPort([
      () => replyStream("{"),
      () => replyStream("{"),
    ]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result).toEqual({
      reply: DEFAULT_FALLBACK_CALLER_REPLY,
      source: "fallback",
      attempts: [
        expect.objectContaining({ attempt: 1, outcome: "invalid-response" }),
        expect.objectContaining({ attempt: 2, outcome: "invalid-response" }),
      ],
    });
  });

  it("returns the fallback after two provider errors", async () => {
    const llmPort = new FakeLlmPort([failedStream, failedStream]);

    const result = await createService(llmPort).generate(
      validRequest,
      new AbortController().signal,
    );

    expect(result.source).toBe("fallback");
    expect(result.attempts.map(({ outcome }) => outcome)).toEqual([
      "provider-error",
      "provider-error",
    ]);
  });

  it("propagates cancellation without retrying or returning a fallback", async () => {
    const controller = new AbortController();

    async function* cancellingStream(): AsyncIterable<LlmStreamEvent> {
      controller.abort(new Error("Generation cancelled"));
      yield { type: "text.delta", delta: JSON.stringify(validReply) };
    }

    const llmPort = new FakeLlmPort([cancellingStream, replyStream]);

    await expect(
      createService(llmPort).generate(validRequest, controller.signal),
    ).rejects.toThrow("Generation cancelled");
    expect(llmPort.calls).toHaveLength(1);
  });

  it("validates input before calling the provider", async () => {
    const llmPort = new FakeLlmPort([replyStream]);

    await expect(
      createService(llmPort).generate(
        { ...validRequest, operatorText: "" },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    expect(llmPort.calls).toHaveLength(0);
  });
});
