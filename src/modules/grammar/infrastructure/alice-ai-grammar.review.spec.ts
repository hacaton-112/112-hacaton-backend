import type { AliceAiStructuredOutputClient } from "@/modules/ai-gateway/adapters/alice-ai/alice-ai-structured-output.client";

import {
  AliceAiGrammarReview,
  GRAMMAR_REVIEW_SYSTEM_PROMPT,
} from "./alice-ai-grammar.review";

const createReview = (findings: unknown) => {
  const complete = jest.fn().mockResolvedValue({ findings });

  return {
    review: new AliceAiGrammarReview({
      complete,
    } as unknown as AliceAiStructuredOutputClient),
    complete,
  };
};

const signal = () => new AbortController().signal;

describe(AliceAiGrammarReview.name, () => {
  it("sends only the texts and asks for a strict answer", async () => {
    const { review, complete } = createReview([]);

    await review.review(
      [{ id: "description", value: "Горит крыша" }],
      signal(),
    );

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "grammar_findings",
        systemPrompt: GRAMMAR_REVIEW_SYSTEM_PROMPT,
        userPrompt: JSON.stringify({
          texts: [{ id: "description", value: "Горит крыша" }],
        }),
      }),
    );
  });

  it("keeps the findings of the texts it was given", async () => {
    const { review } = createReview([
      {
        textId: "description",
        fragment: "поехал бригада",
        message: "Ошибка согласования.",
        suggestion: "поехала бригада",
      },
    ]);

    await expect(
      review.review([{ id: "description", value: "поехал бригада" }], signal()),
    ).resolves.toEqual([
      {
        textId: "description",
        fragment: "поехал бригада",
        message: "Ошибка согласования.",
        suggestion: "поехала бригада",
      },
    ]);
  });

  it("drops a finding about a text that was never sent", async () => {
    // Модель иногда придумывает идентификатор поля; такому месту в отчёте
    // взяться неоткуда.
    const { review } = createReview([
      {
        textId: "somewhere_else",
        fragment: "крыша",
        message: "Опечатка.",
        suggestion: null,
      },
    ]);

    await expect(
      review.review([{ id: "description", value: "Горит крыша" }], signal()),
    ).resolves.toEqual([]);
  });

  it("treats an empty correction as no correction", async () => {
    const { review } = createReview([
      {
        textId: "description",
        fragment: "крыша",
        message: "Проверьте окончание.",
        suggestion: "   ",
      },
    ]);

    const [finding] = await review.review(
      [{ id: "description", value: "Горит крыша" }],
      signal(),
    );

    expect(finding!.suggestion).toBeNull();
  });

  it("refuses an answer that does not match the schema", async () => {
    const { review } = createReview([{ textId: "description" }]);

    await expect(
      review.review([{ id: "description", value: "Горит крыша" }], signal()),
    ).rejects.toThrow();
  });
});
