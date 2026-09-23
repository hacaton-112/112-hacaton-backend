import { describe, expect, test } from "bun:test";

import {
  PhoneCallSnapshotSchema,
  PhoneHostMessageSchema,
  PhoneWindowMessageSchema,
} from "../src/lib/operator-phone-window";

const snapshot = {
  state: "active" as const,
  callerNumber: "+7 916 204-71-33",
  scenarioTitle: "Пожар в жилом доме",
  elapsedSeconds: 42,
  answerNormSeconds: 240,
  isMuted: false,
  isListening: true,
  isCallerSpeaking: false,
  isRecovering: false,
  dialogue: [{ id: "1", role: "caller" as const, text: "Горит квартира" }],
};

describe("окно телефона оператора", () => {
  test("снимок звонка переживает пересылку между окнами", () => {
    const message = PhoneHostMessageSchema.parse(
      JSON.parse(JSON.stringify({ type: "snapshot", snapshot })),
    );

    expect(message.snapshot.dialogue[0]!.text).toBe("Горит квартира");
    expect(message.snapshot.elapsedSeconds).toBe(42);
  });

  test("окно управляет только трубкой и микрофоном", () => {
    expect(
      PhoneWindowMessageSchema.parse({ type: "command", command: "end" }),
    ).toEqual({ type: "command", command: "end" });
    expect(
      PhoneWindowMessageSchema.safeParse({
        type: "command",
        command: "start-call",
      }).success,
    ).toBe(false);
  });

  test("окно просит снимок при открытии", () => {
    expect(PhoneWindowMessageSchema.parse({ type: "hello" })).toEqual({
      type: "hello",
    });
  });

  test("чужие поля в снимке не принимаются", () => {
    expect(
      PhoneCallSnapshotSchema.safeParse({ ...snapshot, token: "secret" })
        .success,
    ).toBe(false);
  });
});
