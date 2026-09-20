import {
  type GenerateCallerReplyRequest,
  type LlmStreamEvent,
} from "@/contracts";
import { CallerReplySafetyService } from "@/modules/dialogue-generation/application/caller-reply-safety.service";
import { LlmReplyStreamCollector } from "@/modules/dialogue-generation/application/llm-reply-stream.collector";
import { LocalLlmAdapter, LocalLlmConfigSchema } from "./local-llm.adapter";
import {
  expandLocalReply,
  localReplyInput,
  localReplyPrompt,
} from "./local-llm.reply";

const request: GenerateCallerReplyRequest = {
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
    allowedFacts: [
      { id: "place", value: "Во дворе." },
      { id: "injury", value: "Болит нога." },
    ],
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
    speechRate: 1.1,
    endCall: false,
  },
};
const compact = { text: "Во дворе.", revealedFactIds: ["place"] };
async function* events(
  raw: string,
  done = true,
): AsyncIterable<LlmStreamEvent> {
  yield { type: "text.delta", delta: raw.slice(0, 3) };
  yield { type: "text.delta", delta: raw.slice(3) };
  if (done) yield { type: "response.completed" };
}
const collect = (raw: string, done = true) =>
  new LlmReplyStreamCollector(new CallerReplySafetyService()).collect(
    expandLocalReply(events(raw, done), request, new AbortController().signal),
    request.context.allowedFacts,
    new AbortController().signal,
  );

describe("compact local replies", () => {
  it("rehydrates engine style without marking every allowed fact as spoken", async () => {
    const result = await collect(JSON.stringify(compact));
    expect(result.reply).toEqual(request.fallbackReply);
    expect(result.timeToFirstTokenMs).not.toBeNull();
    expect(result.reply.revealedFactIds).not.toContain("injury");
  });
  it.each([
    { ...compact, revealedFactIds: ["hidden"] },
    { ...compact, revealedFactIds: ["place", "place"] },
    { ...compact, emotion: "calm" },
    { ...compact, endCall: true },
    { ...compact, text: "x".repeat(501) },
  ])(
    "rejects forbidden IDs or provider-owned style/termination and invalid lengths: %j",
    async (raw) => {
      await expect(collect(JSON.stringify(raw))).rejects.toThrow();
    },
  );
  it("rejects truncated JSON, missing completion and oversized output", async () => {
    await expect(collect('{"text":"Оборвано')).rejects.toThrow();
    await expect(collect(JSON.stringify(compact), false)).rejects.toThrow(
      "without completion",
    );
    await expect(collect("x".repeat(4097))).rejects.toThrow("size limit");
  });
  it("preserves first-content timing before completion and propagates cancellation", async () => {
    const abort = new AbortController();
    const iterator = expandLocalReply(
      events(JSON.stringify(compact)),
      request,
      abort.signal,
    )[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      value: { type: "text.delta", delta: " " },
      done: false,
    });
    abort.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("restores literal instructions and an exact safe fallback without asking the model for style", () => {
    expect(localReplyPrompt(true)).toContain("Дословно");
    expect(localReplyInput(request, true)).toMatchObject({ fallback: compact });
    expect(localReplyInput(request, false)).not.toHaveProperty("fallback");
  });
  it("requests only text and IDs over real SSE and expands to the unchanged public contract", async () => {
    const payload = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(compact) } }] })}\n\ndata: [DONE]\n\n`;
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(payload, {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const adapter = new LocalLlmAdapter(
      LocalLlmConfigSchema.parse({
        baseUrl: "http://localhost:8080/v1",
        model: "training-model",
        literalFactReplies: true,
      }),
      fetcher,
    );
    const result = await new LlmReplyStreamCollector(
      new CallerReplySafetyService(),
    ).collect(
      adapter.streamReply(request, new AbortController().signal),
      request.context.allowedFacts,
      new AbortController().signal,
    );
    expect(result.reply).toEqual(request.fallbackReply);
    const body: unknown = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
      repeat_penalty: 1,
      max_tokens: 192,
      stream: true,
      response_format: {
        json_schema: {
          schema: {
            required: ["text", "revealedFactIds"],
            properties: {
              revealedFactIds: { items: { enum: ["place", "injury"] } },
            },
          },
        },
      },
    });
  });
});
