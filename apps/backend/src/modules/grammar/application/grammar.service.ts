import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import type {
  GrammarFieldReport,
  GrammarIssue,
  GrammarReport,
  GrammarText,
} from "../domain/grammar-issue";
import { checkGrammar } from "../domain/grammar-rules";
import {
  GRAMMAR_REVIEW_PORT,
  type GrammarReviewPort,
} from "../ports/grammar-review.port";

/**
 * Место фрагмента, ещё не занятое находкой правил.
 *
 * Слово повторяется в тексте, а модель не говорит, о каком вхождении речь.
 * Если первое уже разобрано правилами, берётся следующее: иначе настоящая
 * ошибка во втором вхождении молча потеряется как дубль.
 */
const freeOccurrence = (
  value: string,
  fragment: string,
  issues: readonly GrammarIssue[],
): number => {
  for (
    let offset = value.indexOf(fragment);
    offset >= 0;
    offset = value.indexOf(fragment, offset + 1)
  ) {
    const taken = issues.some(
      (issue) =>
        offset < issue.offset + issue.length &&
        issue.offset < offset + fragment.length,
    );

    if (!taken) {
      return offset;
    }
  }

  return -1;
};

export interface GrammarCheckOptions {
  /** Просить ли модель прочитать текст после правил. */
  readonly deepReview?: boolean;
  readonly signal?: AbortSignal;
}

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);

  constructor(
    @Optional()
    @Inject(GRAMMAR_REVIEW_PORT)
    private readonly review: GrammarReviewPort | null = null,
  ) {}

  /**
   * Проверяет набор полей.
   *
   * Правила отрабатывают всегда. Модель добавляется сверху и только по
   * запросу: её отказ не должен стоить отчёта, поэтому ошибка гасится, а
   * отчёт честно говорит, что модель в нём не участвовала.
   */
  async check(
    texts: readonly GrammarText[],
    options: GrammarCheckOptions = {},
  ): Promise<GrammarReport> {
    const byRules = new Map<string, GrammarIssue[]>(
      texts.map((text) => [text.id, [...checkGrammar(text.value, text.style)]]),
    );
    const reviewedByModel = await this.appendModelReview(
      texts,
      byRules,
      options,
    );

    const fields = texts.map((text): GrammarFieldReport => {
      const issues = (byRules.get(text.id) ?? []).sort(
        (left, right) => left.offset - right.offset,
      );

      return {
        id: text.id,
        label: text.label,
        issues,
        errorCount: issues.filter((issue) => issue.severity === "error").length,
        styleCount: issues.filter((issue) => issue.severity === "style").length,
      };
    });

    return {
      fields,
      errorCount: fields.reduce((total, field) => total + field.errorCount, 0),
      styleCount: fields.reduce((total, field) => total + field.styleCount, 0),
      reviewedByModel,
    };
  }

  private async appendModelReview(
    texts: readonly GrammarText[],
    byRules: Map<string, GrammarIssue[]>,
    options: GrammarCheckOptions,
  ): Promise<boolean> {
    const filled = texts.filter((text) => text.value.trim().length > 0);

    if (
      options.deepReview !== true ||
      this.review === null ||
      filled.length === 0
    ) {
      return false;
    }

    try {
      const findings = await this.review.review(
        filled.map((text) => ({ id: text.id, value: text.value })),
        options.signal ?? new AbortController().signal,
      );

      for (const finding of findings) {
        const text = filled.find((item) => item.id === finding.textId);

        if (text === undefined || finding.fragment.length === 0) {
          continue;
        }

        const issues = byRules.get(text.id)!;
        // Фрагмент должен быть в тексте дословно: выдуманное место ошибки
        // подсветить нельзя, а спорить со стажёром о несказанном — тем более.
        const offset = freeOccurrence(text.value, finding.fragment, issues);

        if (offset < 0) {
          continue;
        }

        issues.push({
          kind: "model-review",
          severity: "error",
          offset,
          length: finding.fragment.length,
          fragment: finding.fragment,
          message: finding.message,
          suggestion: finding.suggestion,
        });
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Could not review the text with the model: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      return false;
    }
  }
}
