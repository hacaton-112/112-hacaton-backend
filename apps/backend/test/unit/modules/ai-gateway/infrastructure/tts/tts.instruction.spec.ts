import { CallerEmotionSchema } from "@/contracts";

import {
  QWEN_TTS_VOICE_STABILITY_INSTRUCTION,
  buildTtsInstruction,
  mapTtsIntensity,
} from "@/modules/ai-gateway/infrastructure/tts/tts.instruction";

const emotionCases = [
  ["neutral", "Подача нейтральная и естественная."],
  ["calm", "Подача спокойная и уверенная."],
  [
    "anxious",
    "Подача тревожная и взволнованная, с лёгким напряжением в голосе.",
  ],
  ["panic", "Подача срочная и испуганная, со слегка сбившимся дыханием."],
  ["pain", "Передавай боль напряжением голоса, сохраняя речь ясной."],
  ["anger", "Подача сердитая и резкая, но контролируемая."],
  [
    "confusion",
    "Подача растерянная и неуверенная, с короткими естественными паузами.",
  ],
] as const;

const intensityCases = [
  [0, "слабая", "Эмоция едва заметна."],
  [0.33, "слабая", "Эмоция едва заметна."],
  [0.34, "средняя", "Эмоция отчётлива, но сдержанна."],
  [0.66, "средняя", "Эмоция отчётлива, но сдержанна."],
  [
    0.67,
    "сильная",
    "Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым.",
  ],
  [
    1,
    "сильная",
    "Эмоция выражена сильно, но голос остаётся контролируемым и разборчивым.",
  ],
] as const;

describe(buildTtsInstruction.name, () => {
  it.each(emotionCases)(
    "keeps the voice stable for %s delivery",
    (emotion, emotionInstruction) => {
      expect(buildTtsInstruction(emotion, 0.5)).toBe(
        `${QWEN_TTS_VOICE_STABILITY_INSTRUCTION} ${emotionInstruction} Эмоция отчётлива, но сдержанна.`,
      );
    },
  );

  it.each(
    CallerEmotionSchema.options.flatMap((emotion) =>
      [0.2, 0.5, 0.8].map((intensity) => [emotion, intensity] as const),
    ),
  )(
    "includes the identity anchor exactly once for %s at %s intensity",
    (emotion, intensity) => {
      const instruction = buildTtsInstruction(emotion, intensity);

      expect(instruction.startsWith(QWEN_TTS_VOICE_STABILITY_INSTRUCTION)).toBe(
        true,
      );
      expect(
        instruction.split(QWEN_TTS_VOICE_STABILITY_INSTRUCTION),
      ).toHaveLength(2);
      expect(instruction.length).toBeLessThanOrEqual(512);
    },
  );
});

describe(mapTtsIntensity.name, () => {
  it.each(intensityCases)(
    "maps intensity %s to %s",
    (intensity, level, expectedInstruction) => {
      expect(mapTtsIntensity(intensity)).toBe(level);
      expect(buildTtsInstruction("neutral", intensity)).toContain(
        expectedInstruction,
      );
    },
  );
});
