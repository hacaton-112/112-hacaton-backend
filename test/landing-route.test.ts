import { describe, expect, it } from "bun:test";

import { landingRouteForRole } from "../src/lib/landing-route";

describe("role landing route", () => {
  it("opens assignments for a learner", () => {
    expect(landingRouteForRole("operator")).toBe("/assignments");
  });

  it("does not change the existing home of staff roles", () => {
    expect(landingRouteForRole("instructor")).toBe("/");
    expect(landingRouteForRole("admin")).toBe("/");
  });
});
