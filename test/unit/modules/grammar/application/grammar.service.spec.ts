import { Logger } from "@nestjs/common";

import type { GrammarText } from "@/modules/grammar/domain/grammar-issue";
import type { GrammarReviewPort } from "@/modules/grammar/ports/grammar-review.port";
import { GrammarService } from "@/modules/grammar/application/grammar.service";

const texts = (value: string, style: GrammarText["style"] = "prose") => [
  { id: "dispatcher_notes", label: "Примечания", value, style },
];

describe(GrammarService.name, () => {
  it("counts errors and style remarks of every field", async () => {
    const report = await new GrammarService().check([
      {
        id: "street",
        label: "Улица",
        value: "Улицa Учебная",
        style: "terse",
      },
      {
        id: "dispatcher_notes",
        label: "Примечания",
        value: "Горит крыша , дым в подъезде.",
        style: "prose",
      },
    ]);

    expect(report.fields[0]).toMatchObject({ errorCount: 1, styleCount: 0 });
    expect(report.fields[1]).toMatchObject({ errorCount: 0, styleCount: 1 });
    expect(report).toMatchObject({
      errorCount: 1,
      styleCount: 1,
      reviewedByModel: false,
    });
  });

  it("keeps a clean field in the report", async () => {
    // Пустой раздел в отчёте лучше отсутствующего: преподаватель видит, что
    // поле проверено и к нему нет замечаний.
    const report = await new GrammarService().check(texts("Горит квартира."));

    expect(report.fields).toHaveLength(1);
    expect(report.fields[0]!.issues).toEqual([]);
  });

  it("does not ask the model unless it is asked to", async () => {
    const review = jest.fn();

    await new GrammarService({ review } as GrammarReviewPort).check(
      texts("Горит квартира."),
    );

    expect(review).not.toHaveBeenCalled();
  });

  it("adds what the model found to what the rules found", async () => {
    const review = jest.fn().mockResolvedValue([
      {
        textId: "dispatcher_notes",
        fragment: "поехал бригада",
        message: "Сказуемое не согласовано с подлежащим.",
        suggestion: "поехала бригада",
      },
    ]);

    const report = await new GrammarService({
      review,
    } as unknown as GrammarReviewPort).check(
      texts("На вызов поехал бригада, дым в подъезде."),
      { deepReview: true },
    );

    expect(report.reviewedByModel).toBe(true);
    expect(report.fields[0]!.issues).toEqual([
      expect.objectContaining({
        kind: "model-review",
        severity: "error",
        offset: 9,
        fragment: "поехал бригада",
        suggestion: "поехала бригада",
      }),
    ]);
  });

  it("drops a finding whose fragment is not in the text", async () => {
    // Модель регулярно пересказывает текст своими словами: подсветить такое
    // место нельзя, а спорить со стажёром о несказанном тем более.
    const review = jest.fn().mockResolvedValue([
      {
        textId: "dispatcher_notes",
        fragment: "горит склад",
        message: "Ошибка согласования.",
        suggestion: null,
      },
    ]);

    const report = await new GrammarService({
      review,
    } as unknown as GrammarReviewPort).check(texts("Горит квартира."), {
      deepReview: true,
    });

    expect(report.fields[0]!.issues).toEqual([]);
  });

  it("does not report the same place twice", async () => {
    const review = jest.fn().mockResolvedValue([
      {
        textId: "dispatcher_notes",
        fragment: "Пoжар",
        message: "Опечатка.",
        suggestion: "Пожар",
      },
    ]);

    const report = await new GrammarService({
      review,
    } as unknown as GrammarReviewPort).check(texts("Пoжар в подъезде."), {
      deepReview: true,
    });

    expect(report.fields[0]!.issues.map((issue) => issue.kind)).toEqual([
      "mixed-alphabet",
    ]);
  });

  it("returns the rules when the model fails", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const review = jest.fn().mockRejectedValue(new Error("provider is down"));

    const report = await new GrammarService({
      review,
    } as unknown as GrammarReviewPort).check(texts("Пoжар в подъезде."), {
      deepReview: true,
    });

    expect(report.reviewedByModel).toBe(false);
    expect(report.fields[0]!.issues).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("works when no model adapter is wired at all", async () => {
    const report = await new GrammarService().check(texts("Пoжар."), {
      deepReview: true,
    });

    expect(report.reviewedByModel).toBe(false);
    expect(report.errorCount).toBe(1);
  });
});
