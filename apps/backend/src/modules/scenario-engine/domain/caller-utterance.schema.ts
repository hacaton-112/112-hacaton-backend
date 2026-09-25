import { z } from "zod";

const OPERATOR_UTTERANCE_MARKERS = [
  /(?:служба|оператор)\s*[-–—]?\s*112/iu,
  /что\s+(?:у\s+вас\s+)?случилось/iu,
  /что\s+произошло/iu,
  /расскажите(?:\s+мне)?\s+(?:подробнее|что)/iu,
  /назовите\s+(?:ваш|точный)?\s*адрес/iu,
  /оставайтесь\s+на\s+линии/iu,
] as const;

export const isLikelyOperatorUtterance = (value: string): boolean =>
  OPERATOR_UTTERANCE_MARKERS.some((marker) => marker.test(value));

/** A scripted call line is always spoken by the caller, never by the operator. */
export const CallerUtteranceSchema = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine((value) => !isLikelyOperatorUtterance(value), {
    message: "Реплика должна звучать от лица заявителя, а не оператора 112",
  });
