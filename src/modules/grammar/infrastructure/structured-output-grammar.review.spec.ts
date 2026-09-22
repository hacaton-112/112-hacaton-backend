import type { StructuredOutputPort } from "@/modules/ai-gateway/ports/structured-output.port";

import {
  StructuredOutputGrammarReview,
  GRAMMAR_REVIEW_SYSTEM_PROMPT,
} from "./structured-output-grammar.review";

const createReview = (findings: unknown) => {
  const complete = jest.fn().mockResolvedValue({ findings });

  return {
    review: new StructuredOutputGrammarReview({
      complete,
    } as StructuredOutputPort),
    complete,
  };
};

const signal = () => new AbortController().signal;

describe(StructuredOutputGrammarReview.name, () => {
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

  it("drops one bad finding instead of the whole answer", async () => {
    // Одна негодная строка не должна стоить всей углублённой проверки:
    // иначе отчёт скажет, что модель не участвовала, хотя она ответила.
    const { review } = createReview([
      { textId: "description" },
      {
        textId: "description",
        fragment: "поехал бригада",
        message: "Слова не согласованы.",
        suggestion: "поехала бригада",
      },
    ]);

    const found = await review.review(
      [{ id: "description", value: "Горит крыша, поехал бригада" }],
      signal(),
    );

    expect(found.map((finding) => finding.fragment)).toEqual([
      "поехал бригада",
    ]);
  });

  it("shortens an explanation nobody would read", async () => {
    const { review } = createReview([
      {
        textId: "description",
        fragment: "поехал бригада",
        message: "а".repeat(400),
        suggestion: null,
      },
    ]);

    const found = await review.review(
      [{ id: "description", value: "Горит крыша, поехал бригада" }],
      signal(),
    );

    expect(found[0]!.message).toHaveLength(300);
  });

  it("refuses an answer without a list of findings", async () => {
    const { review } = createReview("не список");

    await expect(
      review.review([{ id: "description", value: "Горит крыша" }], signal()),
    ).rejects.toThrow();
  });
});
