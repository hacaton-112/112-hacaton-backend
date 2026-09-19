import { describe, expect, it } from "bun:test";

import { crewCallVerdict } from "../src/components/dds/dds-formatters";
import {
  type DdsCrewCall,
  DdsExerciseSchema,
} from "../src/contracts/dds-exercise";

const exercise = {
  id: "68e4085a-a84f-435e-804f-8a242db80385",
  scenarioVersionId: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
  trainingAttemptId: null,
  sourceTrainingSessionId: "session-1",
  addressedService: "dds_01",
  status: "accepted",
  allowedTransitions: ["responding", "refused"],
  card: {
    scenarioCode: "S-FIRE-01",
    title: "Пожар в квартире",
    summary: "На пятом этаже горит квартира.",
    category: "fire",
    addressText: "Москва, Учебная улица, 12",
    latitude: 55.75,
    longitude: 37.61,
    callerName: "Анна Максутова",
    callerPhone: "+79990000000",
    incidentType: "Пожар",
    description: "Дым из окна квартиры",
    victimsTotal: 1,
    services: ["dds_01"],
  },
  acknowledgementDeadlineAt: "2026-09-15T12:00:30.000Z",
  acknowledgedAt: "2026-09-15T12:00:20.000Z",
  completedAt: null,
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-15T12:00:20.000Z",
  events: [],
  result: null,
};

const call = (overrides: Partial<DdsCrewCall> = {}): DdsCrewCall => ({
  dialedNumber: "1012",
  callsign: "Пожарно-спасательная часть 12",
  startedAt: "2026-09-15T12:00:40.000Z",
  endedAt: "2026-09-15T12:01:05.000Z",
  outcome: "completed",
  correct: true,
  acknowledgements: 2,
  ...overrides,
});

describe("crew handoff in the DDS card", () => {
  it("still reads a card from a backend without telephony", () => {
    // Старый backend поля не присылает вовсе, выключенная телефония — `null`.
    expect(DdsExerciseSchema.parse(exercise).crewHandoff).toBeUndefined();
    expect(
      DdsExerciseSchema.parse({ ...exercise, crewHandoff: null }).crewHandoff,
    ).toBeNull();
  });

  it("reads the crews of the service and the calls made", () => {
    const parsed = DdsExerciseSchema.parse({
      ...exercise,
      crewHandoff: {
        notified: true,
        crews: [
          { callsign: "Пожарно-спасательная часть 12", phoneNumber: "1012" },
        ],
        calls: [
          call({
            dialedNumber: "1999",
            callsign: null,
            outcome: "unknown_number",
            correct: false,
          }),
          call(),
        ],
      },
    });

    expect(parsed.crewHandoff?.calls.map((item) => item.dialedNumber)).toEqual([
      "1999",
      "1012",
    ]);
  });

  it("reads the violations a phone call adds to the result", () => {
    const parsed = DdsExerciseSchema.parse({
      ...exercise,
      status: "completed",
      result: {
        score: 90,
        passed: true,
        acknowledgementMet: true,
        terminalStatus: "completed",
        violations: ["wrong_crew_dialed"],
      },
    });

    expect(parsed.result?.violations).toEqual(["wrong_crew_dialed"]);
  });

  it("names the outcome of every call", () => {
    expect(crewCallVerdict(call()).label).toBe("Наряд принял");
    expect(crewCallVerdict(call({ correct: false })).label).toBe(
      "Не та служба",
    );
    expect(
      crewCallVerdict(call({ outcome: "unknown_number", correct: false }))
        .label,
    ).toBe("Номер не обслуживается");
    expect(crewCallVerdict(call({ outcome: "abandoned" })).label).toBe(
      "Разговор прерван",
    );
    expect(crewCallVerdict(call({ outcome: null, endedAt: null })).label).toBe(
      "Идёт разговор",
    );
  });
});
