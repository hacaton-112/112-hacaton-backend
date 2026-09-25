import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("telephony deployment assets", () => {
  it("proxies the public secure browser-phone path to private Asterisk WS", () => {
    const nginx = readFileSync(
      join(process.cwd(), "ops", "nginx", "nginx.conf"),
      "utf8",
    );

    expect(nginx).toContain("server asterisk:8088;");
    expect(nginx).toContain("location = /asterisk/ws");
    expect(nginx).toContain("proxy_pass http://system112_asterisk/ws;");
    expect(nginx).toContain("proxy_set_header Upgrade $http_upgrade;");
  });

  it("documents a same-origin WSS URL in the production environment", () => {
    const environment = readFileSync(
      join(process.cwd(), ".env.production.example"),
      "utf8",
    );

    expect(environment).toContain(
      "ASTERISK_WEBRTC_WS_URL=wss://system112.example.internal/asterisk/ws",
    );
    expect(environment).toContain(
      "ASTERISK_WEBRTC_SIP_DOMAIN=system112.example.internal",
    );
  });
});
