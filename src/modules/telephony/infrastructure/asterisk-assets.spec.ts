import { readFileSync } from "node:fs";

const PJSIP_CONFIG = "telephony/asterisk/pjsip.conf";

describe("bundled Asterisk assets", () => {
  it("keeps the browser phone on codecs supported by the bundled image", () => {
    const config = readFileSync(PJSIP_CONFIG, "utf8");
    const webRtcEndpoint = config.match(
      /\[dds-webrtc-endpoint\]\(!\)([\s\S]*?)(?=\n\[|$)/u,
    )?.[1];

    expect(webRtcEndpoint).toBeDefined();
    expect(webRtcEndpoint).toMatch(/^allow = ulaw,alaw$/mu);
    expect(webRtcEndpoint).not.toMatch(/^allow = .*opus/mu);
  });
});
