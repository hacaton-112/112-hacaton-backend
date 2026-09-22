import { parseTelephonyConfig } from "./telephony.config";

describe("parseTelephonyConfig", () => {
  it("keeps telephony off until it is asked for", () => {
    expect(parseTelephonyConfig({}).enabled).toBe(false);
  });

  it("reads the ARI connection of an enabled PBX", () => {
    expect(
      parseTelephonyConfig({
        TELEPHONY_ENABLED: "true",
        ASTERISK_ARI_URL: "http://asterisk:8088/",
        ASTERISK_ARI_PASSWORD: "secret",
      }),
    ).toMatchObject({
      enabled: true,
      ari: {
        url: "http://asterisk:8088",
        user: "system112",
        password: "secret",
        app: "crew-handoff",
      },
    });
  });

  it("refuses to enable telephony without the ARI password", () => {
    // Иначе звонки молча не проходили бы, а шаг передачи наряду стал бы
    // невыполнимым прямо на занятии.
    expect(() => parseTelephonyConfig({ TELEPHONY_ENABLED: "true" })).toThrow();
  });

  it("refuses a flag it cannot read", () => {
    expect(() => parseTelephonyConfig({ TELEPHONY_ENABLED: "1" })).toThrow();
  });
});
