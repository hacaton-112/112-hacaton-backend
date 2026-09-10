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

export const QWEN_TTS_VOICE_STABILITY_INSTRUCTION =
  "Сохраняй естественный голос выбранного диктора: не меняй тембр, высоту голоса, возраст и акцент. Меняй только эмоциональную подачу. Точно произноси заданный текст: не добавляй, не пропускай и не заменяй слова. Не переходи на крик или фальцет и не вставляй стоны, вздохи и другие неречевые звуки.";

const emotionInstructions = {
  neutral: "Подача нейтральная и естественная.",
  calm: "Подача спокойная и уверенная.",
  anxious: "Подача тревожная и взволнованная, с лёгким напряжением в голосе.",
  panic: "Подача срочная и испуганная, со слегка сбившимся дыханием.",
  pain: "Передавай боль напряжением голоса, сохраняя речь ясной.",
  anger: "Подача сердитая и резкая, но контролируемая.",
  confusion:
    "Подача растерянная и неуверенная, с короткими естественными паузами.",
} as const satisfies Record<CallerEmotion, string>;

export type QwenTtsIntensityLevel = z.infer<typeof QwenTtsIntensityLevelSchema>;

const intensityInstructions = {
  слабая: "Эмоция едва заметна.",
  средняя: "Эмоция отчётлива, но сдержанна.",
  сильная:
    "Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым.",
} as const satisfies Record<QwenTtsIntensityLevel, string>;

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

  return `${QWEN_TTS_VOICE_STABILITY_INSTRUCTION} ${emotionInstructions[parsedEmotion]} ${intensityInstructions[intensityLevel]}`;
};
