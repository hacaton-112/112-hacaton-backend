import { z } from "zod";

import { CallerGenderSchema } from "./speech.contracts";

/**
 * Голоса, которые умеет рантайм синтеза.
 *
 * Список нужен не адаптеру, а автору сценария: голос обязан совпадать с тем,
 * кого играет заявитель, и проверить это можно только зная, кому какой голос
 * принадлежит. Мужчина, говорящий женским голосом, разрушает занятие быстрее
 * любой ошибки в тексте.
 */
export const CALLER_VOICES = [
  { id: "aiden", gender: "male" },
  { id: "dylan", gender: "male" },
  { id: "eric", gender: "male" },
  { id: "ryan", gender: "male" },
  { id: "uncle_fu", gender: "male" },
  { id: "ono_anna", gender: "female" },
  { id: "serena", gender: "female" },
  { id: "sohee", gender: "female" },
  { id: "vivian", gender: "female" },
] as const satisfies readonly {
  id: string;
  gender: z.infer<typeof CallerGenderSchema>;
}[];

export type CallerVoiceId = (typeof CALLER_VOICES)[number]["id"];

export const findCallerVoice = (
  voiceId: string,
): (typeof CALLER_VOICES)[number] | undefined => {
  const normalized = voiceId.toLowerCase();

  return CALLER_VOICES.find((voice) => voice.id === normalized);
};
