import { describe, expect, it } from "bun:test";

import {
  dispatchServiceSelectionChanges,
  findDispatchServices,
  toggleDispatchServiceSelection,
} from "../src/lib/dispatch-service-search";

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

  it("keeps dialog changes in a draft until they are applied", () => {
    const current = ["dds_01", "dds_02"] as const;
    const draft = toggleDispatchServiceSelection(current, "dds_03");

    expect(current).toEqual(["dds_01", "dds_02"]);
    expect(draft).toEqual(["dds_01", "dds_02", "dds_03"]);
    expect(dispatchServiceSelectionChanges(current, draft)).toEqual(["dds_03"]);
  });

  it("does not remove services locked by the classifier", () => {
    expect(
      toggleDispatchServiceSelection(["dds_01", "dds_02"], "dds_01", [
        "dds_01",
      ]),
    ).toEqual(["dds_01", "dds_02"]);
    expect(
      dispatchServiceSelectionChanges(
        ["dds_01", "dds_02"],
        ["dds_02"],
        ["dds_01"],
      ),
    ).toEqual([]);
  });
});
