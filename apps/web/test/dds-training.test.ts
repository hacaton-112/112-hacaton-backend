import { describe, expect, test } from "bun:test";

import { DdsTrainingListSchema } from "../src/contracts/dds-training";

const exercise = {
  id: "d9c0a338-683f-4726-ad78-5acafa51b17a",
  scenarioVersionId: "6f7934eb-ee0f-43ef-b81a-bd1c26054026",
  trainingAttemptId: null,
  sourceTrainingSessionId: null,
  addressedService: "dds_01",
  status: "refused",
  allowedTransitions: [],
  card: {
    scenarioCode: "S-FIRE-01",
    title: "Пожар в квартире",
    summary: "На пятом этаже горит квартира.",
    category: "fire",
    addressText: "Учебная улица, 1",
    latitude: 55.4,
    longitude: 37.19,
    callerName: "Анна Петрова",
    callerPhone: "+79990000000",
    incidentType: "Открытое пламя",
    description: "Дым из окна квартиры на пятом этаже",
    victimsTotal: 1,
    services: ["dds_01"],
  },
  acknowledgementDeadlineAt: "2026-09-22T04:19:35.130Z",
  acknowledgedAt: "2026-09-22T04:19:35.130Z",
  completedAt: "2026-09-22T04:44:46.704Z",
  createdAt: "2026-09-22T04:19:05.130Z",
  updatedAt: "2026-09-22T04:44:46.704Z",
  events: [],
  result: {
    score: 45,
    passed: false,
    acknowledgementMet: true,
    terminalStatus: "refused",
    violations: ["response_refused"],
  },
  crewHandoff: null,
};

describe("DdsTrainingListSchema", () => {
  test("keeps compatibility with a server that only returns assigned attempts", () => {
    expect(DdsTrainingListSchema.parse({ attempts: [] })).toEqual({
      attempts: [],
      standaloneResults: [],
    });
  });

  test("parses a scored standalone DDS result", () => {
    const parsed = DdsTrainingListSchema.parse({
      attempts: [],
      standaloneResults: [
        {
          exercise,
          operatorId: "a896b5e6-43c1-4ea5-8deb-6f91cf1b1196",
          operatorName: "Учебный оператор",
          passThreshold: 75,
        },
      ],
    });

    expect(parsed.standaloneResults[0]?.exercise.result?.score).toBe(45);
  });
});
