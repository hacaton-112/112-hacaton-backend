import type { ScenarioVersionSnapshot } from "@/modules/scenario-engine/ports/scenario-store.port";
import {
  audioFingerprint,
  compilePreparedSpeech,
  resolvePreparedQuestion,
} from "./prepared-dialogue";

const version: ScenarioVersionSnapshot = {
  id: "version-1",
  scenarioCode: "test",
  title: "Учебный звонок",
  category: "other",
  difficulty: 1,
  isPublished: true,
  panicFloor: 0,
  panicCeiling: 1,
  maxInterruptions: 1,
  initiativeCooldownSeconds: 12,
  answerNormSeconds: 60,
  passThreshold: 75,
  expectedServices: ["ambulance"],
  openingLine: "Помогите, пожалуйста!",
  fallbackLine: "Я не знаю.",
  persona: {
    displayName: "Учебный заявитель",
    gender: "female",
    ageYears: 30,
    condition: "Волнуется",
    speechStyle: "Кратко",
    backgroundSounds: null,
    voiceId: "Vivian",
    baselinePanicLevel: 0,
    baseSpeechRate: 1,
  },
  facts: [
    {
      key: "address",
      displayLabel: "Адрес",
      promptValue: "Учебная улица, дом 12.",
      severity: "normal",
      disclosure: { type: "on_question", keywords: ["адрес"] },
      contentKeywords: ["учебная"],
      priority: 1,
      orderIndex: 0,
    },
  ],
  escalationRules: [],
  mandatoryQuestions: [],
  locator: null,
};

describe("prepared dialogue", () => {
  it("recognizes authored questions, not substrings or negations", () => {
    const facts = [
      { id: "address", label: "Адрес", question: "Назовите адрес?" },
    ];
    expect(resolvePreparedQuestion(" НАЗОВИТЕ адрес! ", facts)).toEqual([
      "address",
    ]);
    expect(
      resolvePreparedQuestion("Не надо: назовите адрес", facts),
    ).toBeNull();
    expect(resolvePreparedQuestion("Где вы?", facts)).toBeNull();
  });
  it("prepares authored facts at allowed panic levels without inventing location", () => {
    const requests = compilePreparedSpeech(version);
    expect(
      requests.filter((r) => r.text === version.facts[0]!.promptValue),
    ).toHaveLength(2);
    expect(
      requests.every(
        (r) =>
          r.sessionId === version.id && ["calm", "anxious"].includes(r.emotion),
      ),
    ).toBe(true);
    expect(new Set(requests.map(audioFingerprint)).size).toBe(requests.length);
    expect(
      compilePreparedSpeech({
        ...version,
        facts: [{ ...version.facts[0]!, promptValue: "я".repeat(501) }],
      }).some((r) => r.text.startsWith("яя")),
    ).toBe(false);
  });
  it("fingerprints full text and engine voice, not session or request identity", () => {
    const request = compilePreparedSpeech(version)[0]!;
    expect(
      audioFingerprint({ ...request, sessionId: "other", requestId: "other" }),
    ).toBe(audioFingerprint(request));
    for (const changed of [
      { ...request, text: "Другой адрес." },
      { ...request, voiceId: "Ryan" },
      { ...request, speechRate: 1.2 },
    ]) {
      expect(audioFingerprint(changed)).not.toBe(audioFingerprint(request));
    }
  });
});
