import { describe, expect, test } from "bun:test";

import {
  formatBrowserPhoneError,
  isBrowserMicrophonePermissionError,
  PhoneHostMessageSchema,
  PhoneWindowMessageSchema,
} from "../src/lib/browser-phone-window";
import { answerBrowserPhone } from "../src/services/browser-phone.service";

const requestId = "68e4085a-a84f-435e-804f-8a242db80385";

describe("browser phone window channel", () => {
  test("carries the number dialled in the phone window", () => {
    const message = PhoneWindowMessageSchema.parse({
      type: "dial",
      requestId,
      number: "1012",
    });

    expect(message).toEqual({ type: "dial", requestId, number: "1012" });
  });

  test("refuses a number the dial pad cannot produce", () => {
    for (const number of ["", "10-12", "тревога", "1234567890123"]) {
      expect(
        PhoneWindowMessageSchema.safeParse({ type: "dial", requestId, number })
          .success,
      ).toBe(false);
    }
  });

  test("keeps the registration message of the window intact", () => {
    expect(
      PhoneWindowMessageSchema.parse({
        type: "registered",
        requestId,
        extension: "202",
      }).type,
    ).toBe("registered");
  });

  test("reports the actual SIP call lifecycle to the DDS card", () => {
    for (const state of ["ringing", "connected", "ended", "error"] as const) {
      expect(
        PhoneWindowMessageSchema.parse({
          type: "call-state",
          requestId,
          state,
          ...(state === "error" ? { message: "Связь завершена" } : {}),
        }),
      ).toMatchObject({ type: "call-state", state });
    }
  });
});

describe("browser phone errors", () => {
  test("explains a denied microphone instead of exposing the browser error", () => {
    const reason = new DOMException("Permission denied", "NotAllowedError");

    expect(isBrowserMicrophonePermissionError(reason)).toBe(true);
    expect(formatBrowserPhoneError(reason)).toContain("настройках сайта");
    expect(formatBrowserPhoneError(reason)).not.toContain("Permission denied");
  });

  test("explains a closed media peer without blaming SIP registration", () => {
    expect(formatBrowserPhoneError(new Error("Peer connection closed."))).toBe(
      "Медиасоединение текущего звонка закрылось. Телефон остаётся подключённым — повторите вызов.",
    );
  });

  test("hides the PBX websocket URL from an operator", () => {
    const message = formatBrowserPhoneError(
      new Error("WebSocket closed wss://pbx.internal.example/ws"),
    );

    expect(message).toContain("WSS");
    expect(message).not.toContain("pbx.internal.example");
  });

  test("explains rejected SIP registration", () => {
    expect(
      formatBrowserPhoneError(new Error("Registration rejected: 403")),
    ).toContain("учётные данные SIP");
  });
});

describe("browser phone answer", () => {
  test("does not accept the SIP invitation while microphone access is denied", async () => {
    let accepted = false;
    const phone = {
      answer: async () => {
        accepted = true;
      },
    };
    const denied = new DOMException("Permission denied", "NotAllowedError");

    await expect(
      answerBrowserPhone(phone, () => Promise.reject(denied)),
    ).rejects.toBe(denied);
    expect(accepted).toBe(false);
  });

  test("accepts the SIP invitation after microphone access succeeds", async () => {
    let accepted = false;
    const phone = {
      answer: async () => {
        accepted = true;
      },
    };

    await answerBrowserPhone(phone, () => Promise.resolve());
    expect(accepted).toBe(true);
  });
});

describe("справочник нарядов в окне телефона", () => {
  test("рабочее место передаёт наряды и право звонить", () => {
    const message = PhoneHostMessageSchema.parse({
      type: "context",
      requestId: "3f6d2f5c-3e0a-4a1f-9d9f-6f1d0f58a111",
      canCall: true,
      crews: [{ callsign: "АЦ-1 ПСЧ-25", phoneNumber: "3101" }],
    });

    expect(message).toMatchObject({ type: "context", canCall: true });
  });

  test("наряд без номера в справочник не попадает", () => {
    expect(
      PhoneHostMessageSchema.safeParse({
        type: "context",
        requestId: "3f6d2f5c-3e0a-4a1f-9d9f-6f1d0f58a111",
        canCall: true,
        crews: [{ callsign: "Без связи", phoneNumber: "" }],
      }).success,
    ).toBe(false);
  });

  test("итог вызова приходит в окно от рабочего места", () => {
    const message = PhoneHostMessageSchema.parse({
      type: "status",
      requestId: "3f6d2f5c-3e0a-4a1f-9d9f-6f1d0f58a111",
      kind: "error",
      message: "Наряд не отвечает",
    });

    expect(message).toMatchObject({ kind: "error" });
  });

  test("закрытая карточка отсоединяет аппарат от упражнения", () => {
    expect(
      PhoneHostMessageSchema.parse({
        type: "detach",
        requestId: "3f6d2f5c-3e0a-4a1f-9d9f-6f1d0f58a111",
      }).type,
    ).toBe("detach");
  });
});
