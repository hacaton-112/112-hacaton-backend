import type { CallerReply, GenerateCallerReplyRequest } from "@/contracts";
import { CallerReplyValidationError } from "./caller-reply-validation.error";
import { REACTION_ACT_INSTRUCTIONS } from "./reaction-instructions";
import { splitSentences } from "./repetition";

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
const words = (text: string) => normalize(text).split(" ").filter(Boolean);

/** Narrow copying detector, not a semantic fact checker. */
const copied = (text: string, source: string): boolean => {
  const value = normalize(text);
  const original = normalize(source);
  if (!value || !original) return false;
  if (value === original) return true;
  const tokens = words(value);
  if (tokens.length < 2) return false;
  const vocabulary = new Set(words(original));
  if (tokens.length === 2) {
    return tokens.every((word) => word.length >= 4 && vocabulary.has(word));
  }
  if ((" " + original + " ").includes(" " + value + " ")) return true;
  if (
    words(original).length >= 3 &&
    (" " + value + " ").includes(" " + original + " ")
  )
    return true;
  return (
    tokens.length >= 4 &&
    tokens.filter((word) => vocabulary.has(word)).length / tokens.length >= 0.9
  );
};

const instructions = Object.values(REACTION_ACT_INSTRUCTIONS);
const controlLabels = new Set([
  "answer",
  "clarify",
  "acknowledge",
  "hesitate",
  "self correct",
  "repeat",
  "emotional reaction",
  "panic refusal",
]);
export const containsReplyInstruction = (text: string): boolean => {
  const normalized = normalize(text);
  return (
    controlLabels.has(normalized.replaceAll("-", " ")) ||
    instructions.some((instruction) =>
      normalized.includes(normalize(instruction)),
    ) ||
    splitSentences(text).some(
      (sentence) =>
        words(sentence).length >= 4 &&
        instructions.some((instruction) => copied(sentence, instruction)),
    ) ||
    /(?:reactionAct|allowedFacts|revealedFactIds|retryFeedback|turnPlan)|(?:верни|выведи|возвращай)\s+(?:только\s+)?json|(?:следуй|следуйте)\s+(?:системн\S*\s+)?инструкци/iu.test(
      text,
    )
  );
};

const acknowledgements = new Set([
  "да",
  "нет",
  "хорошо",
  "понятно",
  "здравствуйте",
  "алло",
  "не знаю",
  "я не знаю",
]);

export const assertCallerReplyContent = (
  reply: CallerReply,
  request?: GenerateCallerReplyRequest,
): void => {
  if (containsReplyInstruction(reply.text)) {
    throw new CallerReplyValidationError(
      "instruction-leak",
      "Caller reply contains a generation instruction",
    );
  }
  if (!request) return;
  const permitted = request.context.allowedFacts.flatMap(({ value }) => [
    normalize(value),
    ...splitSentences(value).map(normalize),
  ]);
  const operatorTexts = [
    request.operatorText,
    ...request.context.recentTurns
      .filter(({ role }) => role === "operator")
      .slice(-4)
      .map(({ text }) => text),
  ];
  for (const sentence of splitSentences(reply.text)) {
    const text = normalize(sentence);
    // Exact factual confirmation is allowed, not just a shared fact keyword.
    const factual = text.replace(/^(?:да|хорошо)\s+/u, "");
    if (
      acknowledgements.has(text) ||
      permitted.includes(text) ||
      permitted.includes(factual)
    )
      continue;
    if (operatorTexts.some((operator) => copied(sentence, operator))) {
      throw new CallerReplyValidationError(
        "operator-echo",
        "Caller reply copies operator speech",
      );
    }
  }
};

/** Engine-authored text, no invented inference attempt and no model load. */
export const canUseEngineReaction = (
  request: GenerateCallerReplyRequest,
): boolean => {
  if (
    !request.fallbackReply ||
    !request.context.turnPlan ||
    request.context.allowedFacts.length ||
    request.fallbackReply.revealedFactIds.length ||
    request.fallbackReply.endCall
  )
    return false;
  try {
    assertCallerReplyContent(request.fallbackReply, request);
    return true;
  } catch {
    return false;
  }
};
