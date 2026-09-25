import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenAPIObject } from "@nestjs/swagger";

const document = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "..", "docs", "сдача", "openapi.json"),
    "utf8",
  ),
) as OpenAPIObject;

describe("сдаваемое описание OpenAPI", () => {
  it("собрано из маршрутов приложения и содержит основные контуры", () => {
    const paths = Object.keys(document.paths);
    for (const route of [
      "/api/v1/auth/login",
      "/api/v1/scenarios",
      "/api/v1/dds-lessons",
      "/api/v1/instructor/reports",
      "/api/v1/users",
    ]) {
      expect(paths).toContain(route);
    }
  });

  it("содержит схемы Zod DTO, а не только перечень адресов", () => {
    expect(Object.keys(document.components?.schemas ?? {}).length).toBeGreaterThan(
      30,
    );
  });
});
