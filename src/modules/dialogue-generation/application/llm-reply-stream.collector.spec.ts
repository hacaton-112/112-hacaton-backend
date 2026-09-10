import type { LlmStreamEvent, ScenarioFact } from "@/contracts";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";
import { LlmReplyCollectionError } from "../domain/llm-reply-collection.error";
import { CallerReplySafetyService } from "./caller-reply-safety.service";
import {
  LlmReplyStreamCollector,
  MAX_RAW_LLM_RESPONSE_LENGTH,
} from "./llm-reply-stream.collector";

const allowedFacts: ScenarioFact[] = [
  { id: "fire_location", value: "Возгорание находится на кухне" },
];

const validReply = {
  text: "Горит кухня!",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
  revealedFactIds: ["fire_location"],
  endCall: false,
} as const;

async function* events(values: readonly unknown[]): AsyncIterable<unknown> {
  for (const value of values) {
    yield value;
  }
}

const completedEvent: LlmStreamEvent = { type: "response.completed" };

describe(LlmReplyStreamCollector.name, () => {
  const collector = new LlmReplyStreamCollector(new CallerReplySafetyService());

  it("collects and validates a JSON reply from multiple deltas", async () => {
    const serializedReply = JSON.stringify(validReply);
    const midpoint = Math.floor(serializedReply.length / 2);

    const result = await collector.collect(
      events([
        { type: "text.delta", delta: serializedReply.slice(0, midpoint) },
        { type: "text.delta", delta: serializedReply.slice(midpoint) },
        completedEvent,
      ]),
      allowedFacts,
      new AbortController().signal,
    );

    expect(result.reply).toEqual(validReply);
    expect(result.timeToFirstTokenMs).toEqual(expect.any(Number));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects malformed JSON", async () => {
    await expect(
      collector.collect(
        events([{ type: "text.delta", delta: "{" }, completedEvent]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<LlmReplyCollectionError>>({
      failure: "invalid-json",
    });
  });

  it("rejects JSON that does not match CallerReplySchema", async () => {
    await expect(
      collector.collect(
        events([
          {
            type: "text.delta",
            delta: JSON.stringify({ text: "Недостаточно" }),
          },
          completedEvent,
        ]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<CallerReplyValidationError>>({
      reason: "invalid-schema",
    });
  });

  it("rejects a response exceeding the raw response limit", async () => {
    await expect(
      collector.collect(
        events([
          {
            type: "text.delta",
            delta: "x".repeat(MAX_RAW_LLM_RESPONSE_LENGTH + 1),
          },
        ]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<LlmReplyCollectionError>>({
      failure: "response-too-large",
    });
  });

  it("rejects a stream without a completion event", async () => {
    await expect(
      collector.collect(
        events([{ type: "text.delta", delta: JSON.stringify(validReply) }]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<LlmReplyCollectionError>>({
      failure: "protocol-error",
    });
  });

  it("rejects a stream with events after completion", async () => {
    await expect(
      collector.collect(
        events([
          { type: "text.delta", delta: JSON.stringify(validReply) },
          completedEvent,
          completedEvent,
        ]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<LlmReplyCollectionError>>({
      failure: "protocol-error",
    });
  });

  it("rejects invalid stream events", async () => {
    await expect(
      collector.collect(
        events([{ type: "text.delta", content: "unexpected" }]),
        allowedFacts,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<LlmReplyCollectionError>>({
      failure: "invalid-event",
    });
  });
});
