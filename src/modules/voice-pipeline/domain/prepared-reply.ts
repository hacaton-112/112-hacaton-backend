import type { VoicePipelineRequest } from "@/contracts";
import { isGroundedOfflineReply } from "./offline-turn";
import { assertCallerReplyContent } from "@/modules/dialogue-generation/domain/caller-reply-content";

/** The engine decides disclosure first; question-parser provenance is irrelevant. */
export const canUsePreparedReply = (request: VoicePipelineRequest): boolean => {
  const { fallbackReply, context } = request.generation;
  const plan = context.turnPlan;
  if (!fallbackReply || !plan || request.exceptionReason) return false;
  try {
    assertCallerReplyContent(fallbackReply, request.generation);
  } catch {
    return false;
  }
  if ((plan.focusFactIds?.length ?? 0) > 1) return false;
  if (!isGroundedOfflineReply(fallbackReply, request.generation)) return false;
  if (fallbackReply.revealedFactIds.length) {
    return ["answer", "repeat", "acknowledge"].includes(plan.reactionAct);
  }
  return [
    "acknowledge",
    "emotional-reaction",
    "panic-refusal",
    "clarify",
    "repeat",
    "hesitate",
    "self-correct",
  ].includes(plan.reactionAct);
};
