import { describe, expect, it } from "bun:test";

import { landingRouteForRole } from "../src/lib/landing-route";
import { ROUTES } from "../src/config/routes";

describe("role landing route", () => {
  it("opens assignments for a learner", () => {
    expect(landingRouteForRole("operator")).toBe("/assignments");
  });

  it("opens the dedicated workplace route for staff roles", () => {
    expect(landingRouteForRole("instructor")).toBe("/operator");
    expect(landingRouteForRole("admin")).toBe("/operator");
  });

  it("uses a readable browser route for the operator workplace", () => {
    expect(ROUTES.operatorWorkplace()).toBe("/operator");
    expect(ROUTES.operatorWithScenario("scenario 1")).toBe(
      "/operator?scenario=scenario%201",
    );
  });
});
