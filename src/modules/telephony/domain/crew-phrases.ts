import { createHash } from "node:crypto";

import type { CrewPrompt } from "./crew-handoff-script";
import type { CrewHandoffField } from "./crew-handoff-validation";
import type { CrewProgressReportStatus } from "./crew-call";

/**
 * Что говорит наряд.
 *
 * Квитанции чередуются, чтобы наряд не отвечал одним и тем же словом на каждую
 * фразу: так разговор звучит как приём, а не как автоответчик.
 */
export const CREW_CLOSING = "Принято, выезжаем.";
export const CREW_INCOMPLETE =
  "Карточка передана не полностью. Повторите передачу.";
export const CREW_RECOGNITION_UNAVAILABLE =
  "Не удалось распознать передачу. Повторите звонок позже.";
export const NO_ACTIVE_CARD_LINE = "Нет принятой карточки для передачи.";

export const CREW_CLARIFICATIONS: Readonly<Record<CrewHandoffField, string>> = {
  address: "Повторите адрес происшествия.",
  incident: "Уточните, что произошло.",
  description: "Передайте краткое описание обстановки.",
  victims: "Уточните количество пострадавших.",
};

export const crewGreeting = (callsign: string): string =>
  `${callsign.trim()}, слушаю.`;

/** Текст реплики наряда для команды автомата. */
export const crewPhrase = (
  prompt: CrewPrompt,
  callsign: string,
  missingField?: CrewHandoffField,
): string => {
  switch (prompt) {
    case "greeting":
      return crewGreeting(callsign);
    case "clarification":
      return CREW_CLARIFICATIONS[missingField ?? "description"];
    case "closing":
      return CREW_CLOSING;
    case "incomplete":
      return CREW_INCOMPLETE;
    case "recognition-unavailable":
      return CREW_RECOGNITION_UNAVAILABLE;
  }
};

/** Все реплики наряда — их озвучивают заранее, до первого звонка. */
export const crewPhrases = (callsign: string): readonly string[] => [
  crewGreeting(callsign),
  ...Object.values(CREW_CLARIFICATIONS),
  CREW_CLOSING,
  CREW_INCOMPLETE,
  CREW_RECOGNITION_UNAVAILABLE,
];

/**
 * Детерминированный доклад наряда при контрольном звонке.
 *
 * Статус выбирает Scenario Engine, а не TTS/LLM. Поэтому одна и та же карточка
 * всегда даёт один и тот же доклад и не может самопроизвольно «продвинуться».
 */
export const crewProgressReport = (
  callsign: string,
  status: CrewProgressReportStatus,
  card: { readonly addressText: string; readonly incidentType: string },
): string => {
  switch (status) {
    case "arrived":
      return `${callsign.trim()}. Прибыли по адресу: ${card.addressText}.`;
    case "working":
      return `${callsign.trim()}. Работы по происшествию «${card.incidentType}» проводятся.`;
    case "completed":
      return `${callsign.trim()}. Работы по происшествию «${card.incidentType}» завершены.`;
  }
};

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

/** Частота, к которой приводится речь, если Asterisk не знает частоту синтеза. */
export const FALLBACK_PROMPT_SAMPLE_RATE = 16_000;

/**
 * Линейное пересэмплирование моно PCM16 little-endian.
 *
 * Нужно синтезу с нестандартной частотой вроде 22 050 Гц у Piper. Звонок всё
 * равно идёт узкополосным кодеком, поэтому линейной интерполяции достаточно.
 */
export const resamplePcm16 = (
  audio: Uint8Array,
  fromRate: number,
  toRate: number,
): Uint8Array => {
  const input = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const inputSamples = Math.floor(audio.byteLength / 2);
  const outputSamples = Math.floor((inputSamples * toRate) / fromRate);
  const output = new Uint8Array(outputSamples * 2);
  const view = new DataView(output.buffer);
  const step = fromRate / toRate;

  for (let index = 0; index < outputSamples; index += 1) {
    const position = index * step;
    const left = Math.floor(position);
    const right = Math.min(left + 1, inputSamples - 1);
    const fraction = position - left;
    const sample =
      input.getInt16(left * 2, true) * (1 - fraction) +
      input.getInt16(right * 2, true) * fraction;
    view.setInt16(index * 2, Math.round(sample), true);
  }

  return output;
};

/** Asterisk выбирает файл по имени без расширения из каталога звуков. */
export const crewPromptMedia = (name: string): string => `sound:crew/${name}`;
