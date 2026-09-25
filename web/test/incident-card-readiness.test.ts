import { describe, expect, test } from "bun:test";

import { IncidentCardSchema } from "../src/contracts/incident";
import {
  getClassifierDispatchServices,
  getMissingIncidentCardFields,
  getMissingIncidentCardRequirements,
} from "../src/lib/incident-card-readiness";

const completeCard = IncidentCardSchema.parse({
  callerAnonymous: false,
  callerLastName: null,
  callerFirstName: null,
  callerMiddleName: null,
  callerLanguage: null,
  callerPhone: null,
  addressText: "Москва, ул. Тверская, 1",
  district: null,
  objectType: null,
  entrance: null,
  floor: null,
  intercom: null,
  latitude: 55.757,
  longitude: 37.615,
  nearby: false,
  placeNotes: null,
  classifierEntryId: "f6f37b12-f5cb-443c-a12c-fb35a46de789",
  classifierQualifierCodes: [],
  classifierRouting: {
    classifierVersionId: "f39c763c-e689-43cc-bd3e-4c3172747ce1",
    classifierEntryId: "f6f37b12-f5cb-443c-a12c-fb35a46de789",
    sourceCode: "FIRE",
    featurePath: ["Пожар", "Жилой дом"],
    finalType: "Пожар в жилом доме",
    ekpType: null,
    qualifierCodes: [],
    mainServiceCode: "dds_01",
    requiredServices: [],
  },
  incidentType: "Пожар в жилом доме",
  categories: [],
  startedAt: null,
  victimsTotal: null,
  victimsChildren: null,
  deathsTotal: null,
  deathsChildren: null,
  description: "Дым из окна квартиры",
  services: ["dds_01"],
  victims: [],
  submittedAt: null,
});

describe("incident card dispatch readiness", () => {
  test("accepts the same complete payload as DDS dispatch", () => {
    expect(getMissingIncidentCardFields(completeCard)).toEqual([]);
  });

  test("explains every missing operator action", () => {
    const incompleteCard = {
      ...completeCard,
      addressText: " ",
      latitude: null,
      longitude: null,
      incidentType: null,
      classifierRouting: null,
      description: null,
      services: [],
    };
    expect(getMissingIncidentCardFields(incompleteCard)).toEqual([
      "адрес",
      "точка на карте",
      "тип происшествия",
      "классификация происшествия",
      "описание со слов заявителя",
      "служба ДДС",
    ]);
    expect(
      getMissingIncidentCardRequirements(incompleteCard).map(
        ({ field }) => field,
      ),
    ).toEqual([
      "address",
      "point",
      "incidentType",
      "classifierRouting",
      "description",
      "services",
    ]);
  });

  test("maps classifier routing to immutable DDS selections", () => {
    expect(
      getClassifierDispatchServices({
        ...completeCard.classifierRouting!,
        mainServiceCode: "01",
        requiredServices: [
          { code: "police", name: "Полиция", routeLabel: "Наряд" },
          {
            code: "svc_a1b2c3",
            name: "Скорая медицинская помощь",
            routeLabel: "Бригада",
          },
        ],
      }),
    ).toEqual(["dds_01", "dds_02", "dds_03"]);
  });
});
