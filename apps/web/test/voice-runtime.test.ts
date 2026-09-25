import { describe, expect, test } from "bun:test";
import {
  VoiceRuntimeSchema,
  voiceOutcomeLabel,
} from "../src/contracts/voice-runtime";

describe("voice runtime", () => {
  const status = {
    profile: "offline-hybrid",
    exceptionBudgetMs: 8000,
    outcomes: { deadline: 2 },
    scope: "backend-process",
    dynamicAudioBuffered: true,
  };
  test("parses offline and standard profiles", () => {
    expect(VoiceRuntimeSchema.parse(status).outcomes.deadline).toBe(2);
    expect(
      VoiceRuntimeSchema.parse({ ...status, profile: "standard", outcomes: {} })
        .profile,
    ).toBe("standard");
  });
  test("rejects corrupt counters and unknown modes", () => {
    expect(
      VoiceRuntimeSchema.safeParse({ ...status, outcomes: { deadline: -1 } })
        .success,
    ).toBe(false);
    expect(
      VoiceRuntimeSchema.safeParse({ ...status, profile: "cloud" }).success,
    ).toBe(false);
  });
  test("explains outcome codes without displaying unknown internal identifiers", () => {
    expect(voiceOutcomeLabel("deadline")).toBe("Превышено время ожидания");
    expect(voiceOutcomeLabel("internal-key")).toBe("Другая причина");
  });
});
