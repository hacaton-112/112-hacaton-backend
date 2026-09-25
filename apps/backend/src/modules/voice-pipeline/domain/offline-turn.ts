import type { CallerReply, GenerateCallerReplyRequest } from "@/contracts";

/** High-confidence bypass patterns only. The factual allowlist remains the security boundary. */
export const requestsInstructionOverride = (text: string): boolean =>
  /(?:ignore|disregard).{0,40}(?:instruction|prompt)|(?:игнорируй|забудь|раскрой|покажи).{0,40}(?:инструкци|промпт|скрыт.{0,15}факт)|(?:system|developer)\s*(?:prompt|message)|<\|(?:im_start|system)/iu.test(
    text,
  );

/** Offline free text cannot introduce even one unsupported clause or a new number/address. */
export const isGroundedOfflineReply = (
  reply: CallerReply,
  request: GenerateCallerReplyRequest,
): boolean => {
  const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
  if (reply.endCall && !request.fallbackReply?.endCall) return false;
  const values = reply.revealedFactIds.map(
    (id) => request.context.allowedFacts.find((fact) => fact.id === id)?.value,
  );
  if (values.some((value) => value === undefined)) return false;
  if (
    request.fallbackReply &&
    normalize(reply.text) === normalize(request.fallbackReply.text)
  )
    return (
      JSON.stringify([...reply.revealedFactIds].sort()) ===
      JSON.stringify([...request.fallbackReply.revealedFactIds].sort())
    );
  if (!values.length) return false;
  // Literal fact composition is intentionally narrower than semantic "fact checking" by another model.
  return [" ", ". "].some((separator) =>
    ["", "Хорошо. "].some(
      (prefix) =>
        normalize(reply.text) === normalize(prefix + values.join(separator)),
    ),
  );
};

/** Enforce the deadline even if a custom provider ignores AbortSignal. */
export const abortable = <T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) {
    // The caller may have started work just before cancellation. Consume its
    // eventual rejection even though its result must no longer be observed.
    void work.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
};
