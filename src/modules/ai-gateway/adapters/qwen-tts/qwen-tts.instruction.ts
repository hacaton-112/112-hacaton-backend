import { z } from "zod";

import {
  CallerEmotionSchema,
  EmotionIntensitySchema,
  type CallerEmotion,
} from "@/contracts";

export const QwenTtsIntensityLevelSchema = z.enum([
  "слабая",
  "средняя",
  "сильная",
]);

const emotionInstructions = {
  neutral: "Говори нейтрально и естественно.",
  calm: "Говори спокойно и уверенно.",
  anxious: "Говори тревожно и взволнованно.",
  panic: "Говори в панике, сбивчиво и напряжённо.",
  pain: "Говори так, будто испытываешь боль.",
  anger: "Говори сердито и резко.",
  confusion: "Говори растерянно и неуверенно.",
} as const satisfies Record<CallerEmotion, string>;

export type QwenTtsIntensityLevel = z.infer<
  typeof QwenTtsIntensityLevelSchema
>;

export const mapQwenTtsIntensity = (
  intensity: number,
): QwenTtsIntensityLevel => {
  const value = EmotionIntensitySchema.parse(intensity);

  if (value < 0.34) {
    return "слабая";
  }

  if (value < 0.67) {
    return "средняя";
  }

  return "сильная";
};

export const buildQwenTtsInstruction = (
  emotion: CallerEmotion,
  intensity: number,
): string => {
  const parsedEmotion = CallerEmotionSchema.parse(emotion);
  const intensityLevel = mapQwenTtsIntensity(intensity);

  return `${emotionInstructions[parsedEmotion]} Выраженность эмоции: ${intensityLevel}.`;
};
