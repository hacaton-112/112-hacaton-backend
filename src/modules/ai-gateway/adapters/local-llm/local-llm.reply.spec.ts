import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";
import { CallerReplySafetyService } from "@/modules/dialogue-generation/application/caller-reply-safety.service";
import { LlmReplyStreamCollector } from "@/modules/dialogue-generation/application/llm-reply-stream.collector";
import { expandLocalReply } from "./local-llm.reply";

export const localRequest: GenerateCallerReplyRequest = {
  requestId: "request",
  sessionId: "session",
  scenarioVersionId: "version",
  operatorText: "Где вы?",
  context: {
    persona: {
      id: "caller",
      description: "Учебный заявитель",
      language: "Russian",
    },
    allowedFacts: [{ id: "place", value: "Во дворе." }],
    recentTurns: [],
    turnPlan: {
      reactionAct: "answer",
      focusFactIds: ["place"],
      minimumResponseDelayMs: 0,
    },
  },
  fallbackReply: {
    text: "Во дворе.",
    revealedFactIds: ["place"],
    emotion: "panic",
    intensity: 0.8,
    speechRate: 1.2,
    endCall: false,
  },
};
const collector = new LlmReplyStreamCollector(new CallerReplySafetyService());
const collect = (stream: AsyncIterable<LlmStreamEvent>) =>
  collector.collect(
    expandLocalReply(stream, localRequest),
    localRequest.context.allowedFacts,
    new AbortController().signal,
  );
async function* chunks(
  text: string,
  complete = true,
): AsyncIterable<LlmStreamEvent> {
  for (const delta of text) yield { type: "text.delta", delta };
  if (complete) yield { type: "response.completed" };
}

describe("compact local reply", () => {
  it("parses the fragmented compact protocol and fills style from the engine", async () => {
    const result = await collect(
      chunks(" \nUSED: place\nREPLY: Во дворе."),
    );
    expect(result.reply).toEqual(localRequest.fallbackReply);
    expect(result.timeToFirstTokenMs).not.toBeNull();
  });
  it("does not emit anything before the first provider token", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* delayed(): AsyncIterable<LlmStreamEvent> {
      await gate;
      yield* chunks("USED: place\nREPLY: Во дворе.");
    }
    const iterator = expandLocalReply(delayed(), localRequest)[
      Symbol.asyncIterator
    ]();
    let emitted = false;
    const next = iterator.next().then((event) => {
      emitted = true;
      return event;
    });
    await Promise.resolve();
    expect(emitted).toBe(false);
    release();
    expect((await next).value).toMatchObject({ type: "text.delta" });
    await iterator.return?.();
  });
  it.each([
    "USED: hidden\nREPLY: Во дворе.",
    "USED: place\nTEXT: Во дворе.",
    "REPLY: Во дворе.",
    "not protocol",
  ])("rejects invalid or engine-overriding output: %s", async (text) => {
    await expect(collect(chunks(text))).rejects.toThrow();
  });
  it("does not accept a truncated stream without completion", async () => {
    await expect(
      collect(
        chunks("USED: place\nREPLY: Во дворе.", false),
      ),
    ).rejects.toThrow();
  });
});
