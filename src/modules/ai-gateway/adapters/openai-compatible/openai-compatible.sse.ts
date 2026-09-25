import { z } from "zod";

import { LlmStreamEventSchema, type LlmStreamEvent } from "@/contracts";

import { OpenAiCompatibleError } from "./openai-compatible.error";

// Provider envelopes are deliberately passthrough: an OpenAI-compatible server may add
// metadata fields. Only the subset used at our boundary is validated below.
const StreamDeltaSchema = z
  .object({
    content: z.string().nullable().optional(),
    role: z.string().optional(),
  })
  .passthrough();

const StreamChoiceSchema = z
  .object({
    index: z.number().int().nonnegative(),
    delta: StreamDeltaSchema,
  })
  .passthrough();

export const StreamChunkSchema = z
  .object({
    choices: z.array(StreamChoiceSchema),
  })
  .passthrough();

const findEventBoundary = (
  buffer: string,
): { readonly index: number; readonly length: number } | null => {
  const match = /\r?\n\r?\n/.exec(buffer);

  return match === null
    ? null
    : { index: match.index, length: match[0].length };
};

const extractEventData = (eventBlock: string): string | null => {
  const dataLines = eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));

  return dataLines.length === 0 ? null : dataLines.join("\n");
};

const parseChunk = (rawData: string): LlmStreamEvent | null => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(rawData);
  } catch {
    throw new OpenAiCompatibleError(
      "invalid-response",
      "The model returned malformed stream data",
    );
  }

  const parsed = StreamChunkSchema.safeParse(decoded);

  if (!parsed.success) {
    throw new OpenAiCompatibleError(
      "invalid-response",
      "The model returned an invalid stream event",
    );
  }

  const primaryChoice = parsed.data.choices.find(({ index }) => index === 0);
  const content = primaryChoice?.delta.content;

  if (content === undefined || content === null || content.length === 0) {
    return null;
  }

  return LlmStreamEventSchema.parse({ type: "text.delta", delta: content });
};

export async function* parseOpenAiSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<LlmStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = findEventBoundary(buffer);

      while (boundary !== null) {
        const eventBlock = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const rawData = extractEventData(eventBlock);

        if (rawData === "[DONE]") {
          yield LlmStreamEventSchema.parse({ type: "response.completed" });
          return;
        }

        if (rawData !== null && rawData.length > 0) {
          const event = parseChunk(rawData);

          if (event !== null) {
            yield event;
          }
        }

        boundary = findEventBoundary(buffer);
      }
    }

    const trailingData = extractEventData(buffer);

    if (trailingData === "[DONE]") {
      yield LlmStreamEventSchema.parse({ type: "response.completed" });
      return;
    }

    if (trailingData !== null && trailingData.length > 0) {
      const event = parseChunk(trailingData);

      if (event !== null) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
