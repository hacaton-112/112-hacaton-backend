import { describe, expect, it } from "bun:test";

import { isRouteActive } from "../src/config/routes";

describe("sidebar route matching", () => {
  it("does not activate DDS cards for results or references", () => {
    expect(isRouteActive("/dds", "/dds")).toBe(true);
    expect(isRouteActive("/dds-results", "/dds")).toBe(false);
    expect(isRouteActive("/dds-references", "/dds")).toBe(false);
  });

  it("matches descendants only when the navigation section owns them", () => {
    expect(isRouteActive("/dds-results/card-1", "/dds-results", true)).toBe(
      true,
    );
    expect(isRouteActive("/dds-results/card-1", "/dds-results")).toBe(false);
    expect(isRouteActive("/groups/group-1", "/groups", true)).toBe(true);
  });

  it("does not confuse routes with a common text prefix", () => {
    expect(isRouteActive("/groups-archive", "/groups", true)).toBe(false);
  });
});
