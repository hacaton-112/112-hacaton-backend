import type { LlmStreamEvent } from "@/contracts";

import { parseOpenAiSse } from "@/modules/ai-gateway/infrastructure/openai-compatible/openai-compatible.sse";

const encoder = new TextEncoder();

const streamBytes = (
  chunks: readonly Uint8Array[],
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const collect = async (
  body: ReadableStream<Uint8Array>,
): Promise<LlmStreamEvent[]> => {
  const events: LlmStreamEvent[] = [];

  for await (const event of parseOpenAiSse(
    body,
    new AbortController().signal,
  )) {
    events.push(event);
  }

  return events;
};

describe(parseOpenAiSse.name, () => {
  it("parses fragmented UTF-8, CRLF, and multiple events per chunk", async () => {
    const payload = [
      ": keep-alive\r\n\r\n",
      'data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\r\n\r\n',
      'data: {"choices":[]}\r\n\r\n',
      'data: {"choices":[{"index":0,"delta":{"content":"Привет"}}]}\r\n\r\n',
      'data: {"choices":[{"index":0,"delta":{"content":"!"}}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ].join("");
    const bytes = encoder.encode(payload);
    const firstCyrillicByte = bytes.findIndex((value) => value > 127);
    const chunks = [
      bytes.slice(0, 17),
      bytes.slice(17, firstCyrillicByte + 1),
      bytes.slice(firstCyrillicByte + 1, firstCyrillicByte + 4),
      bytes.slice(firstCyrillicByte + 4),
    ];

    await expect(collect(streamBytes(chunks))).resolves.toEqual([
      { type: "text.delta", delta: "Привет" },
      { type: "text.delta", delta: "!" },
      { type: "response.completed" },
    ]);
  });

  it("ends without completion when the provider closes before DONE", async () => {
    const payload =
      'data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n';

    await expect(
      collect(streamBytes([encoder.encode(payload)])),
    ).resolves.toEqual([{ type: "text.delta", delta: "partial" }]);
  });

  it.each([
    ["malformed JSON", "data: {\n\n"],
    ["invalid provider shape", 'data: {"choices":"invalid"}\n\n'],
  ])("rejects %s", async (_name, payload) => {
    await expect(
      collect(streamBytes([encoder.encode(payload)])),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invalid-response",
        retryable: false,
      }),
    );
  });
});
