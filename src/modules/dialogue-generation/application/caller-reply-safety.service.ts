import { Injectable } from "@nestjs/common";

import {
  CallerReplySchema,
  EMOTION_INTENSITY_RANGE,
  SPEECH_RATE_RANGE,
  type CallerReply,
  type ScenarioFact,
} from "@/contracts";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";

const clamp = (
  value: unknown,
  { min, max }: { readonly min: number; readonly max: number },
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : value;

@Injectable()
export class CallerReplySafetyService {
  validate(input: unknown, allowedFacts: readonly ScenarioFact[]): CallerReply {
    const parsedReply = CallerReplySchema.safeParse(
      this.withStyleInRange(input),
    );

    if (!parsedReply.success) {
      throw new CallerReplyValidationError(
        "invalid-schema",
        "The generated caller reply does not match the expected schema",
      );
    }

    const allowedFactIds = new Set(allowedFacts.map(({ id }) => id));
    const forbiddenFactId = parsedReply.data.revealedFactIds.find(
      (factId) => !allowedFactIds.has(factId),
    );

    if (forbiddenFactId !== undefined) {
      throw new CallerReplyValidationError(
        "forbidden-fact",
        `The generated caller reply references a forbidden fact: ${forbiddenFactId}`,
      );
    }

    return parsedReply.data;
  }

  /**
   * Приводит окраску голоса к допустимому диапазону.
   *
   * Модель регулярно понимает «интенсивность» как шкалу до десяти, и раньше
   * из-за одного такого числа терялась вся реплика: заявитель вместо ответа
   * говорил запасную фразу. Слова важнее — сила и темп речи только красят
   * голос, и их достаточно вернуть в границы. Факты так не прощаются: их
   * проверка ниже осталась строгой.
   */
  private withStyleInRange(input: unknown): unknown {
    if (input === null || typeof input !== "object") {
      return input;
    }

    const reply = input as Record<string, unknown>;

    return {
      ...reply,
      intensity: clamp(reply.intensity, EMOTION_INTENSITY_RANGE),
      speechRate: clamp(reply.speechRate, SPEECH_RATE_RANGE),
    };
  }
}
