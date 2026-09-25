import { describe, expect, test } from "bun:test";

const indexHtml = await Bun.file(
  new URL("../index.html", import.meta.url),
).text();

describe("document language contract", () => {
  test("declares the Russian UI and prevents browser translators from mutating React DOM", () => {
    expect(indexHtml).toContain('<html lang="ru" translate="no">');
    expect(indexHtml).toContain(
      '<meta name="google" content="notranslate" />',
    );
    expect(indexHtml).toContain('<body class="notranslate">');
  });
});
