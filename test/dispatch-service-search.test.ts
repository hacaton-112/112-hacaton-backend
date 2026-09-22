import { describe, expect, it } from "bun:test";

import { findDispatchServices } from "../src/lib/dispatch-service-search";

describe("dispatch service search", () => {
  it("finds an emergency service by its public phone number", () => {
    expect(findDispatchServices("103")).toEqual(["dds_03"]);
  });

  it("finds a municipal service by its visible label", () => {
    expect(findDispatchServices("жкх")).toEqual(["zhkh"]);
  });

  it("does not offer services that are already selected", () => {
    expect(findDispatchServices("служба", ["dds_01", "dds_02"])).toEqual([
      "dds_03",
      "dds_04",
    ]);
  });
});
