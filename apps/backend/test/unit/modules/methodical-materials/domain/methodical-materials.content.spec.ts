import { METHODICAL_MATERIALS } from "@/modules/methodical-materials/domain/methodical-materials.content";
import { CreateMethodicalMaterialSchema } from "@/modules/methodical-materials/dto/methodical-materials.dto";
import {
  legacyItemsFromMarkdown,
  markdownFromBuiltIn,
  MethodicalMaterialsService,
} from "@/modules/methodical-materials/application/methodical-materials.service";

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

  it("converts built-in sections to editable markdown", () => {
    const section = METHODICAL_MATERIALS[1]?.sections[0];
    expect(section).toBeDefined();
    const markdown = markdownFromBuiltIn(section!);

    expect(markdown).toContain("- Откройте входящую карточку");
    expect(markdown).toContain("> Норматив тренажёра");
    expect(legacyItemsFromMarkdown(markdown)).toHaveLength(
      section!.items.length,
    );
  });

  it("validates authoring limits and unique section identifiers", () => {
    const input = {
      title: "Памятка оператора",
      description: "Порядок приёма учебного вызова",
      audience: "Операторы",
      durationMinutes: 15,
      roles: ["operator"] as const,
      sections: [
        {
          id: "opening",
          title: "Начало вызова",
          summary: "Как начать разговор",
          contentMarkdown: "- Представьтесь",
        },
        {
          id: "opening",
          title: "Повтор",
          summary: "Повторяющийся идентификатор",
          contentMarkdown: "- Уточните адрес",
        },
      ],
    };

    expect(CreateMethodicalMaterialSchema.safeParse(input).success).toBe(false);
    expect(
      CreateMethodicalMaterialSchema.safeParse({
        ...input,
        roles: ["operator"],
        sections: input.sections.map((section, index) => ({
          ...section,
          id: `section-${index}`,
        })),
      }).success,
    ).toBe(true);
  });

  it("rejects authoring from an operator even outside the controller", async () => {
    const service = new MethodicalMaterialsService({} as never, {} as never);

    await expect(
      service.create(
        { id: "operator-1", role: "operator" },
        {
          title: "Памятка",
          description: "Описание памятки",
          audience: "Операторы",
          durationMinutes: 10,
          roles: ["operator"],
          sections: [
            {
              title: "Раздел",
              summary: "Краткое описание",
              contentMarkdown: "- Действие",
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
