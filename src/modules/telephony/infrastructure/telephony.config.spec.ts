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

  it("enables browser phones only for the declared workstations", () => {
    expect(
      parseTelephonyConfig({
        TELEPHONY_ENABLED: "true",
        ASTERISK_ARI_PASSWORD: "ari-secret",
        ASTERISK_SIP_PASSWORD: "sip-master-secret",
        ASTERISK_WEBRTC_WORKSTATIONS: "201, 202",
        ASTERISK_WEBRTC_WS_URL: "wss://pbx.training.test/ws",
        ASTERISK_WEBRTC_SIP_DOMAIN: "pbx.training.test",
      }).browserPhone,
    ).toEqual({
      enabled: true,
      websocketUrl: "wss://pbx.training.test/ws",
      sipDomain: "pbx.training.test",
      extensions: ["201", "202"],
      passwordMaster: "sip-master-secret",
    });
  });

  it("refuses browser phones without a SIP master secret", () => {
    expect(() =>
      parseTelephonyConfig({
        TELEPHONY_ENABLED: "true",
        ASTERISK_ARI_PASSWORD: "ari-secret",
        ASTERISK_WEBRTC_WORKSTATIONS: "201",
      }),
    ).toThrow();
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
