import { Injectable } from "@nestjs/common";

import {
  CallerReplySchema,
  type CallerReply,
  type ScenarioFact,
} from "@/contracts";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";

@Injectable()
export class CallerReplySafetyService {
  validate(input: unknown, allowedFacts: readonly ScenarioFact[]): CallerReply {
    const parsedReply = CallerReplySchema.safeParse(input);

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
}
