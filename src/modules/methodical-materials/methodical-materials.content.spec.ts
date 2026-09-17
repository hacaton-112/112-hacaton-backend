import { METHODICAL_MATERIALS } from "./methodical-materials.content";

describe("methodical materials content", () => {
  it("uses stable unique material and section identifiers", () => {
    const materialIds = METHODICAL_MATERIALS.map((material) => material.id);
    expect(new Set(materialIds).size).toBe(materialIds.length);

    for (const material of METHODICAL_MATERIALS) {
      const sectionIds = material.sections.map((section) => section.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
      expect(material.sections.length).toBeGreaterThan(0);
    }
  });

  it("keeps staff-only guides hidden from operators", () => {
    const operatorMaterials = METHODICAL_MATERIALS.filter((material) =>
      material.roles.includes("operator"),
    );
    expect(operatorMaterials.map((material) => material.id)).toEqual([
      "operator-112",
      "dds-response",
    ]);
  });
});
