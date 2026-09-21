import { describe, expect, test } from "bun:test";

import { PhoneWindowMessageSchema } from "../src/lib/browser-phone-window";

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
});
