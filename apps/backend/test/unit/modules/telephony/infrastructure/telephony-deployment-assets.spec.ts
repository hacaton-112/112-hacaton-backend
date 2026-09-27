import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("telephony deployment assets", () => {
  it("keeps the production gateway independent from Asterisk", () => {
    const nginx = readFileSync(
      join(process.cwd(), "..", "..", "infra", "nginx", "nginx.conf"),
      "utf8",
    );

    expect(nginx).not.toContain("server asterisk:8088;");
    expect(nginx).not.toContain("location = /asterisk/ws");
    expect(nginx).toContain("location /api/");
    expect(nginx).toContain("proxy_set_header Upgrade $http_upgrade;");
  });

  it("starts Asterisk only through its explicit compose profile", () => {
    const compose = readFileSync(
      join(process.cwd(), "..", "..", "docker-compose.yml"),
      "utf8",
    );

    expect(compose).toContain('asterisk:\n    profiles: ["telephony"]');
    expect(compose).not.toContain(
      "gateway:\n    profiles: [\"app\"]\n    depends_on:\n      asterisk:",
    );
  });
});
