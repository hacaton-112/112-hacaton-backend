import { normalizeDdsServiceTag } from "./dds-service-access";

describe(normalizeDdsServiceTag.name, () => {
  it.each([
    ["03", "dds_03"],
    ["4", "dds_04"],
    ["DDS-01", "dds_01"],
    [" dds_02 ", "dds_02"],
    ["ZHKh", "zhkh"],
  ])("maps roster service tag %s to %s", (tag, expected) => {
    expect(normalizeDdsServiceTag(tag)).toBe(expected);
  });

  it("does not reinterpret unrelated training subgroup tags", () => {
    expect(normalizeDdsServiceTag("FIRE_101")).toBeNull();
    expect(normalizeDdsServiceTag("RIZO")).toBeNull();
  });
});
