import { createHash } from "node:crypto";

import type { CrewPrompt } from "./crew-handoff-script";

/**
 * Что говорит наряд.
 *
 * Квитанции чередуются, чтобы наряд не отвечал одним и тем же словом на каждую
 * фразу: так разговор звучит как приём, а не как автоответчик.
 */
export const CREW_ACKNOWLEDGEMENTS = [
  "Записываю.",
  "Так, записал.",
  "Понял, дальше.",
  "Принял.",
] as const;

export const CREW_CLOSING = "Принято, выезжаем.";

export const crewGreeting = (callsign: string): string =>
  `${callsign.trim()}, слушаю.`;

/** Текст реплики наряда для команды автомата. */
export const crewPhrase = (
  prompt: CrewPrompt,
  index: number,
  callsign: string,
): string => {
  switch (prompt) {
    case "greeting":
      return crewGreeting(callsign);
    case "acknowledgement":
      return CREW_ACKNOWLEDGEMENTS[index % CREW_ACKNOWLEDGEMENTS.length]!;
    case "closing":
      return CREW_CLOSING;
  }
};

/** Все реплики наряда — их озвучивают заранее, до первого звонка. */
export const crewPhrases = (callsign: string): readonly string[] => [
  crewGreeting(callsign),
  ...CREW_ACKNOWLEDGEMENTS,
  CREW_CLOSING,
];

/**
 * Имя файла реплики.
 *
 * Зависит только от текста и голоса: одинаковая квитанция двух нарядов с одним
 * голосом озвучивается один раз, а смена голоса даёт новый файл, а не
 * подменяет старый под ногами у идущего звонка.
 */
export const crewPromptName = (text: string, voiceId: string): string =>
  createHash("sha256")
    .update(JSON.stringify(["crew-prompt-v1", text, voiceId]))
    .digest("hex")
    .slice(0, 32);

/**
 * Расширение файла signed linear для частоты синтеза.
 *
 * Asterisk сам перекодирует звук в кодек звонка, поэтому речь хранится с той
 * частотой, с которой её отдал синтез, без пересэмплирования.
 */
const SIGNED_LINEAR_EXTENSIONS: Readonly<Record<number, string>> = {
  8_000: "sln",
  12_000: "sln12",
  16_000: "sln16",
  24_000: "sln24",
  32_000: "sln32",
  44_100: "sln44",
  48_000: "sln48",
  96_000: "sln96",
  192_000: "sln192",
};

export const signedLinearExtension = (sampleRate: number): string | null =>
  SIGNED_LINEAR_EXTENSIONS[sampleRate] ?? null;

/** Asterisk выбирает файл по имени без расширения из каталога звуков. */
export const crewPromptMedia = (name: string): string => `sound:crew/${name}`;
