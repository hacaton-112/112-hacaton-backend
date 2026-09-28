import { describe, expect, mock, test } from "bun:test";

import { DirectCrewCallServerEventSchema } from "../src/contracts/direct-crew-call";
import {
  DirectCrewPhoneHostMessageSchema,
  DirectCrewPhoneWindowMessageSchema,
  reuseDirectCrewPhoneWindow,
  type DirectCrewPhoneWindowSession,
} from "../src/lib/direct-crew-phone-window";
import { shouldStreamCrewMicrophone } from "../src/services/direct-crew-phone.service";

const requestId = "68e4085a-a84f-435e-804f-8a242db80385";
const exerciseId = "a95237ec-cf7c-4139-a96f-c6201800fd4f";

describe("direct DDS crew phone protocol", () => {
  test("passes only the active exercise and offered crews to the popup", () => {
    const context = DirectCrewPhoneHostMessageSchema.parse({
      type: "context",
      requestId,
      exerciseId,
      canCall: true,
      crews: [{ callsign: "ПСЧ-12", phoneNumber: "1012" }],
    });

    expect(context).toMatchObject({ type: "context", exerciseId });
  });

  test("keeps the access token in the same-origin channel, not in a URL", () => {
    const command = DirectCrewPhoneHostMessageSchema.parse({
      type: "configure",
      requestId,
      accessToken: "signed-access-token",
    });

    expect(command.type).toBe("configure");
    expect(JSON.stringify(command)).not.toContain("http");
  });

  test("reports the real direct call lifecycle to the DDS card", () => {
    for (const state of ["connected", "ended", "error"] as const) {
      expect(
        DirectCrewPhoneWindowMessageSchema.parse({
          type: "call-state",
          requestId,
          state,
          ...(state === "error" ? { message: "Связь закрыта" } : {}),
        }),
      ).toMatchObject({ type: "call-state", state });
    }
  });

  test("validates metadata and PCM prompt boundaries from backend", () => {
    const event = DirectCrewCallServerEventSchema.parse({
      type: "audio.start",
      eventId: requestId,
      sessionId: "browser-session-1",
      timestamp: "2026-09-26T12:00:00.000Z",
      promptId: exerciseId,
      text: "Пожарная часть 12, слушаю.",
      sampleRate: 24_000,
    });

    expect(event.type).toBe("audio.start");
  });

  test("does not send the crew reply from speakers back to ASR", () => {
    expect(shouldStreamCrewMicrophone(true, true, true)).toBe(false);
    expect(shouldStreamCrewMicrophone(true, false, true)).toBe(true);
    expect(shouldStreamCrewMicrophone(false, false, true)).toBe(false);
    expect(shouldStreamCrewMicrophone(true, false, false)).toBe(false);
  });

  test("focuses the existing phone instead of opening another connection", () => {
    const session = {
      focus: mock(() => true),
      connect: mock(async () => undefined),
      setContext: mock(() => undefined),
      onCallState: mock(() => () => undefined),
      dispose: mock(() => undefined),
    } satisfies DirectCrewPhoneWindowSession;
    const crews = [{ callsign: "ПСЧ-12", phoneNumber: "1012" }];

    expect(reuseDirectCrewPhoneWindow(session, exerciseId, crews, true)).toBe(
      true,
    );
    expect(session.focus).toHaveBeenCalledTimes(1);
    expect(session.setContext).toHaveBeenCalledWith(exerciseId, crews, true);
    expect(session.connect).not.toHaveBeenCalled();
  });
});
