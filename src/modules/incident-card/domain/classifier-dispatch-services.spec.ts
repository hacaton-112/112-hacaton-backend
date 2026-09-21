import type { ClassifierRoutingSnapshot } from "@/drizzle/schema";

import { classifierDispatchServices } from "./classifier-dispatch-services";

const routing = (
  overrides: Partial<ClassifierRoutingSnapshot> = {},
): ClassifierRoutingSnapshot => ({
  classifierVersionId: "7d382312-d69e-4f10-8c77-f7b795707ccd",
  classifierEntryId: "52a2fb62-356f-49c0-a621-882af11e45c8",
  sourceCode: "12001",
  featurePath: ["Пожар"],
  finalType: "Пожар в жилом доме",
  ekpType: "ПОЖАР",
  mainServiceCode: "01",
  qualifierCodes: [],
  requiredServices: [],
  ...overrides,
});

describe(classifierDispatchServices.name, () => {
  it("maps the numbered main DDS service", () => {
    expect(classifierDispatchServices(routing())).toEqual(["dds_01"]);
  });

  it("adds known routes and removes duplicates", () => {
    expect(
      classifierDispatchServices(
        routing({
          requiredServices: [
            { code: "fire", name: "Пожарная охрана", routeLabel: "Выезд" },
            { code: "police", name: "Полиция", routeLabel: "Наряд" },
            {
              code: "svc_123456789abc",
              name: "Скорая медицинская помощь",
              routeLabel: "Бригада",
            },
            {
              code: "rosgvardia",
              name: "Росгвардия",
              routeLabel: "Наряд",
            },
          ],
        }),
      ),
    ).toEqual(["dds_01", "dds_02", "dds_03", "rosgvardia"]);
  });
});
