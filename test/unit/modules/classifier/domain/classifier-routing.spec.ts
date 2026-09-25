import {
  buildClassifierTree,
  classifierQualifiers,
  routeClassifierEntry,
  type ClassifierRouteRuleView,
} from "@/modules/classifier/domain/classifier-routing";

const rules: readonly ClassifierRouteRuleView[] = [
  {
    serviceCode: "police",
    serviceName: "Полиция",
    mode: "default",
    qualifierCode: null,
    qualifierLabel: null,
    routeLabel: "Обычный наряд",
    orderIndex: 2,
  },
  {
    serviceCode: "police",
    serviceName: "Полиция",
    mode: "selected",
    qualifierCode: "q_threat",
    qualifierLabel: "Есть угроза людям",
    routeLabel: "Усиленный наряд",
    orderIndex: 3,
  },
  {
    serviceCode: "ambulance",
    serviceName: "Скорая помощь",
    mode: "always",
    qualifierCode: null,
    qualifierLabel: null,
    routeLabel: "Бригада СМП",
    orderIndex: 1,
  },
];

const entry = {
  id: "52a2fb62-356f-49c0-a621-882af11e45c8",
  versionId: "7d382312-d69e-4f10-8c77-f7b795707ccd",
  sourceCode: "101",
  groupName: "Пожары",
  feature1: "Пожар",
  feature2: "Жилой дом",
  feature3: null,
  finalType: "Пожар в жилом доме",
  ekpType: "ПОЖАР",
  mainServiceCode: "01",
  operatorVisible: true,
} as const;

describe("classifier routing", () => {
  it("uses the default route until its qualifier is selected", () => {
    const initial = routeClassifierEntry({
      entry,
      rules,
      qualifierCodes: [],
    });
    const selected = routeClassifierEntry({
      entry,
      rules,
      qualifierCodes: ["q_threat"],
    });

    expect(initial.requiredServices).toEqual([
      {
        code: "ambulance",
        name: "Скорая помощь",
        routeLabel: "Бригада СМП",
      },
      {
        code: "police",
        name: "Полиция",
        routeLabel: "Обычный наряд",
      },
    ]);
    expect(selected.requiredServices[1]?.routeLabel).toBe("Усиленный наряд");
    expect(classifierQualifiers(rules)).toEqual([
      { code: "q_threat", label: "Есть угроза людям" },
    ]);
  });

  it("keeps ambiguous text paths as distinct leaves by entry id", () => {
    const tree = buildClassifierTree([
      entry,
      {
        ...entry,
        id: "1616d357-877e-491f-9626-e4bb9ed6a3a1",
        sourceCode: "102",
        finalType: "Пожар повышенного ранга",
      },
    ]);
    const leaves = tree[0]?.children[0]?.children[0]?.children ?? [];

    expect(leaves.map((leaf) => leaf.entryId)).toEqual([
      "52a2fb62-356f-49c0-a621-882af11e45c8",
      "1616d357-877e-491f-9626-e4bb9ed6a3a1",
    ]);
  });

  it("hides technical rows from the operator tree", () => {
    expect(buildClassifierTree([{ ...entry, operatorVisible: false }])).toEqual(
      [],
    );
    expect(
      buildClassifierTree([{ ...entry, operatorVisible: false }], true),
    ).toHaveLength(1);
  });
});
