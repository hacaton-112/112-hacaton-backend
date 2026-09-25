import { DrizzleScenarioCatalog } from "@/modules/scenario-catalog/infrastructure/drizzle-scenario.catalog";

const row = (code: string, version: number) => ({
  scenarioId: code,
  scenarioVersionId: `${code}-v${version}`,
  code,
  title: "Пожар в жилом доме",
  summary: "Горит квартира на пятом этаже",
  category: "fire" as const,
  difficulty: 3,
  answerNormSeconds: 240,
  expectedDurationSeconds: 360,
  version,
});

const createCatalog = (
  rows: ReturnType<typeof row>[],
): DrizzleScenarioCatalog => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  };

  return new DrizzleScenarioCatalog({
    select: () => chain,
  } as never);
};

describe(DrizzleScenarioCatalog.name, () => {
  it("offers the latest published version of each scenario", async () => {
    // Запрос отдаёт версии по убыванию, старые остаются для разбора занятий.
    const catalog = createCatalog([
      row("S-015", 3),
      row("S-015", 2),
      row("S-021", 1),
    ]);

    await expect(catalog.listPublished()).resolves.toEqual([
      expect.objectContaining({ code: "S-015", version: 3 }),
      expect.objectContaining({ code: "S-021", version: 1 }),
    ]);
  });

  it("says nothing rather than failing when nothing is published", async () => {
    await expect(createCatalog([]).listPublished()).resolves.toEqual([]);
  });
});
