import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DialogueEntriesSchema,
  type DialogueEntry,
} from "@/contracts/dialogue-preparation";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";
import { compilePreparedSpeech, normalizeQuestion } from "./prepared-dialogue";

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};

/** Includes location, disclosure, voice and compiler revision, not just utterance text. */
export const preparationHash = (scenario: ScenarioSeed): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        "dialogue-preparation-v1",
        canonical(ScenarioSeedSchema.parse(scenario)),
      ]),
    )
    .digest("hex");

export const initialEntries = (scenario: ScenarioSeed): DialogueEntry[] =>
  scenario.facts.map((fact) => ({
    factKey: fact.key,
    questions: scenario.mandatoryQuestions
      .filter((question) => question.satisfiedByFactKeys.includes(fact.key))
      .map((question) => question.text)
      .slice(0, 4),
    acknowledge: false,
  }));

export const validateEntries = (
  scenario: ScenarioSeed,
  input: unknown,
): DialogueEntry[] => {
  const entries = DialogueEntriesSchema.parse(input);
  const keys = new Set(entries.map((entry) => entry.factKey));
  if (
    entries.length !== scenario.facts.length ||
    keys.size !== entries.length ||
    scenario.facts.some((fact) => !keys.has(fact.key))
  )
    throw new Error("Review must contain each scenario fact exactly once");
  return entries.map((entry) => ({
    ...entry,
    questions: [
      ...new Map(
        entry.questions.map((question) => [
          normalizeQuestion(question),
          question,
        ]),
      ).values(),
    ],
  }));
};

export const replyText = (
  scenario: ScenarioSeed,
  entry: DialogueEntry,
): string => {
  const fact = scenario.facts.find((item) => item.key === entry.factKey);
  if (!fact) throw new Error("Unknown fact");
  return `${entry.acknowledge ? "Хорошо. " : ""}${fact.promptValue}`;
};

export const preparationRequests = (id: string, scenario: ScenarioSeed) => {
  const requests = compilePreparedSpeech(
    {
      id,
      ...scenario.version,
      persona: scenario.persona,
      facts: scenario.facts.map((fact, orderIndex) => ({
        ...fact,
        orderIndex,
      })),
    },
    800,
  );
  const texts = new Set(requests.map((request) => request.text));
  // Stage 1 can skip long lines; a reviewed bank must never claim full coverage after doing so.
  const required = [
    scenario.version.openingLine,
    scenario.version.fallbackLine,
    ...scenario.facts.flatMap((fact) => [
      fact.promptValue,
      `Хорошо. ${fact.promptValue}`,
    ]),
  ];
  if (required.some((text) => !texts.has(text)))
    throw new Error(
      "Для подготовки сократите ответы заявителя до 492 символов: длинные реплики не поддерживаются синтезом.",
    );
  return requests;
};

export const QuestionSuggestionsSchema = z
  .object({
    questions: z.array(z.string().trim().min(5).max(300)).min(1).max(3),
  })
  .strict();

/** Never send facts, answers, addresses, coordinates or a transcript to the model. */
export const questionPrompt = (questions: readonly string[]): string =>
  JSON.stringify({ operatorQuestions: questions });
