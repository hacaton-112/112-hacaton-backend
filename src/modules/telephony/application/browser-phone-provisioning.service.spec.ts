import type { DrizzleTelephonyDirectory } from "../infrastructure/drizzle-telephony.directory";
import type { TelephonyConfig } from "../infrastructure/telephony.config";
import {
  BrowserPhoneProvisioningService,
  deriveBrowserPhonePassword,
} from "./browser-phone-provisioning.service";

const config = {
  enabled: true,
  ari: {
    url: "http://asterisk:8088",
    user: "system112",
    password: "ari-secret",
    app: "crew-handoff",
    mediaHost: "backend",
    mediaBindHost: "0.0.0.0",
  },
  soundsDir: "./telephony-sounds",
  browserPhone: {
    enabled: true,
    websocketUrl: "wss://pbx.training.test/ws",
    sipDomain: "pbx.training.test",
    extensions: ["201"],
    passwordMaster: "sip-master-secret",
  },
} as const satisfies TelephonyConfig;

describe(BrowserPhoneProvisioningService.name, () => {
  it("returns only the credential of the assigned browser workstation", async () => {
    const directory = {
      findWorkstationExtension: jest.fn().mockResolvedValue("201"),
    };
    const service = new BrowserPhoneProvisioningService(
      config,
      directory as unknown as DrizzleTelephonyDirectory,
    );

    await expect(service.get("operator-1")).resolves.toEqual({
      extension: "201",
      aor: "sip:201@pbx.training.test",
      websocketUrl: "wss://pbx.training.test/ws",
      authorizationUsername: "201",
      authorizationPassword: deriveBrowserPhonePassword(
        "sip-master-secret",
        "201",
      ),
      displayName: "DDS 201",
    });
  });

  it("does not provision a classic SIP workstation", async () => {
    const directory = {
      findWorkstationExtension: jest.fn().mockResolvedValue("202"),
    };
    const service = new BrowserPhoneProvisioningService(
      config,
      directory as unknown as DrizzleTelephonyDirectory,
    );

    await expect(service.get("operator-1")).rejects.toMatchObject({
      code: "TELEPHONY_BROWSER_PHONE_UNAVAILABLE",
    });
  });

  it("derives stable per-workstation passwords", () => {
    expect(deriveBrowserPhonePassword("master", "201")).toHaveLength(64);
    expect(deriveBrowserPhonePassword("master", "201")).not.toBe(
      deriveBrowserPhonePassword("master", "202"),
    );
  });
});
