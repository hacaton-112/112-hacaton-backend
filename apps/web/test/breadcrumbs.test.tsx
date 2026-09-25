import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { Breadcrumbs } from "../src/components/ui/breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders breadcrumbs items with links and separators", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Breadcrumbs
          items={[
            { label: "Группы", to: "/groups" },
            { label: "СИП-413" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Группы");
    expect(html).toContain("href=\"/groups\"");
    expect(html).toContain("СИП-413");
    expect(html).toContain("aria-label=\"Навигация (хлебные крошки)\"");
  });

  it("returns null when items are empty", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Breadcrumbs items={[]} />
      </MemoryRouter>,
    );

    expect(html).toBe("");
  });
});
