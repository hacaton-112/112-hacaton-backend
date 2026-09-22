import type { StructuredOutputPort } from "@/modules/ai-gateway/ports/structured-output.port";

import {
  approvedDdsReferenceItems,
  buildQueueReferenceItems,
  requestDdsTextCoverage,
  shouldQueueDdsTextEvaluation,
} from "./dds-text-evaluation.service";

const items = [
  { id: "crew", label: "Бригада", hint: "Назовите бригаду", approved: true },
];

describe("DDS text evaluation", () => {
  it("parses a valid coverage response", async () => {
    const complete = jest.fn().mockResolvedValue({
      items: [{ id: "crew", status: "present", quote: "бригада 12" }],
      contradictions: [],
      summary: "Сведения названы",
    });
    const result = await requestDdsTextCoverage(
      { complete } as StructuredOutputPort,
      {
        expectedOutcome: "accept",
        requiredItems: items,
        dispatcherText: "бригада 12",
      },
      100,
    );
    expect(result.items[0]?.status).toBe("present");
  });

  it("retries one invalid response", async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce({ invalid: true })
      .mockResolvedValueOnce({
        items: [{ id: "crew", status: "missing", quote: null }],
        contradictions: [],
        summary: "Не названо",
      });
    await expect(
      requestDdsTextCoverage(
        { complete } as StructuredOutputPort,
        { expectedOutcome: "accept", requiredItems: items, dispatcherText: "" },
        100,
      ),
    ).resolves.toBeDefined();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("propagates a timeout after the retry", async () => {
    const complete = jest
      .fn()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(
      requestDdsTextCoverage(
        { complete } as StructuredOutputPort,
        { expectedOutcome: "accept", requiredItems: items, dispatcherText: "" },
        1,
      ),
    ).rejects.toThrow("timeout");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("builds an approved deterministic reference for a queue card", () => {
    expect(buildQueueReferenceItems({ victimsTotal: 2 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "address", approved: true }),
        expect.objectContaining({ id: "victims", approved: true }),
      ]),
    );
  });

  it("scores only the items approved by the instructor", () => {
    expect(
      approvedDdsReferenceItems({
        status: "approved",
        requiredItems: [
          ...items,
          {
            id: "address",
            label: "Адрес",
            hint: "Назовите адрес",
            approved: false,
          },
        ],
      }),
    ).toEqual(items);
    expect(
      approvedDdsReferenceItems({ status: "draft", requiredItems: items }),
    ).toEqual([]);
  });

  it("does not enqueue a card closed by the instructor", () => {
    expect(
      shouldQueueDdsTextEvaluation({
        status: "lesson_finished",
        completedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      shouldQueueDdsTextEvaluation({
        status: "completed",
        completedAt: new Date(),
      }),
    ).toBe(true);
  });
});
