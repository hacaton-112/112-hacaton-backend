import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { DdsExercise } from "../dto/dds-exercise.dto";
import type {
  DdsExerciseStore,
  DdsScenarioSource,
  StoredCrewHandoff,
  StoredDdsExercise,
} from "../ports/dds-exercise.store.port";

import { DdsExerciseService } from "./dds-exercise.service";

const EXERCISE_ID = "68e4085a-a84f-435e-804f-8a242db80385";
const VERSION_ID = "a95237ec-cf7c-4139-a96f-c6201800fd4f";
const START_EVENT_ID = "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7";
const TRANSITION_EVENT_ID = "b78c7133-0a9e-4562-9307-0c277046d780";

const scenario = (): DdsScenarioSource => ({
  scenarioVersionId: VERSION_ID,
  code: "S-FIRE-01",
  title: "Пожар в квартире",
  summary: "На пятом этаже горит квартира, внутри может быть ребёнок.",
  category: "fire",
  expectedServices: ["fire", "ambulance"],
  exactAddress: { city: "Москва", street: "Учебная", house: "12" },
  exactLatitude: 55.75,
  exactLongitude: 37.61,
  locatorLabel: "Москва, учебный квартал",
  callerName: "Анна Максутова",
  callerNumber: "+79990000000",
  referenceFields: [],
});

const stored = (
  overrides: Partial<StoredDdsExercise> = {},
): StoredDdsExercise => ({
  id: EXERCISE_ID,
  scenarioVersionId: VERSION_ID,
  operatorId: "operator-1",
  trainingAttemptId: null,
  lessonId: null,
  sourceTrainingSessionId: null,
  addressedService: "dds_01",
  status: "pending",
  card: {
    scenarioCode: "S-FIRE-01",
    title: "Пожар в квартире",
    summary: "На пятом этаже горит квартира, внутри может быть ребёнок.",
    category: "fire",
    addressText: "Москва, Учебная, 12",
    latitude: 55.75,
    longitude: 37.61,
    callerName: "Анна Максутова",
    callerPhone: "+79990000000",
    incidentType: "Пожар в квартире",
    description: "На пятом этаже горит квартира, внутри может быть ребёнок.",
    victimsTotal: null,
    services: ["dds_01", "dds_03"],
  },
  acknowledgementDeadlineAt: new Date("2026-09-15T12:00:30.000Z"),
  acknowledgedAt: null,
  completedAt: null,
  lastSequence: 1,
  score: null,
  passed: null,
  createdAt: new Date("2026-09-15T12:00:00.000Z"),
  updatedAt: new Date("2026-09-15T12:00:00.000Z"),
  events: [
    {
      sequence: 1,
      eventId: START_EVENT_ID,
      actorId: "43bc0812-480f-4e99-b47e-e3b608249ca2",
      fromStatus: null,
      toStatus: "pending",
      comment: null,
      occurredAt: "2026-09-15T12:00:00.000Z",
    },
  ],
  ...overrides,
});

interface StoreMocks {
  loadScenarioSource: jest.Mock;
  findStartedByEvent: jest.Mock;
  findOwnByTransitionEvent: jest.Mock;
  create: jest.Mock;
  listByOperator: jest.Mock;
  listByIds: jest.Mock;
  loadOwn: jest.Mock;
  appendTransition: jest.Mock;
  findAwaitingHandoff: jest.Mock;
  loadCrewHandoffs: jest.Mock;
}

const createService = (
  overrides: Partial<StoreMocks> = {},
  handoffRequired = false,
) => {
  const store: StoreMocks = {
    loadScenarioSource: jest.fn().mockResolvedValue(scenario()),
    findStartedByEvent: jest.fn().mockResolvedValue(null),
    findOwnByTransitionEvent: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (input) =>
      stored({
        id: input.id,
        card: input.card,
        addressedService: input.addressedService,
        acknowledgementDeadlineAt: input.acknowledgementDeadlineAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      }),
    ),
    listByOperator: jest.fn().mockResolvedValue([]),
    listByIds: jest.fn().mockResolvedValue([]),
    loadOwn: jest.fn().mockResolvedValue(stored()),
    appendTransition: jest.fn().mockImplementation(async (input) => ({
      kind: "updated",
      exercise: stored({
        status: input.nextStatus,
        acknowledgedAt: input.acknowledgedAt ?? null,
        completedAt: input.completedAt ?? null,
        lastSequence: input.expectedSequence + 1,
        score: input.score ?? null,
        passed: input.passed ?? null,
      }),
    })),
    findAwaitingHandoff: jest.fn().mockResolvedValue(null),
    loadCrewHandoffs: jest.fn().mockResolvedValue(new Map()),
    ...overrides,
  };

  return {
    service: new DdsExerciseService(
      store as unknown as DdsExerciseStore,
      handoffRequired,
    ),
    store,
  };
};

const codeOf = async (action: () => Promise<unknown>): Promise<string> => {
  try {
    await action();
  } catch (error) {
    return error instanceof AppException ? error.code : "not-an-app-exception";
  }

  return "no-error";
};

describe(DdsExerciseService.name, () => {
  it("returns the same exercise when a start command is retried", async () => {
    const { service, store } = createService({
      findStartedByEvent: jest.fn().mockResolvedValue(stored()),
    });

    await expect(
      service.start("operator-1", {
        scenarioVersionId: VERSION_ID,
        eventId: START_EVENT_ID,
      }),
    ).resolves.toMatchObject({ id: EXERCISE_ID, status: "pending" });
    expect(store.loadScenarioSource).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("creates a card with a server-owned 30 second deadline", async () => {
    const { service, store } = createService();

    const result = await service.start("operator-1", {
      scenarioVersionId: VERSION_ID,
      eventId: START_EVENT_ID,
    });
    const createInput = store.create.mock.calls[0][0];

    expect(result.card.services).toEqual(["dds_01", "dds_03"]);
    expect(
      createInput.acknowledgementDeadlineAt.getTime() -
        createInput.createdAt.getTime(),
    ).toBe(30_000);
  });

  it("rejects a scenario version that cannot address a DDS service", async () => {
    const { service } = createService({
      loadScenarioSource: jest.fn().mockResolvedValue({
        ...scenario(),
        category: "other",
        expectedServices: [],
      }),
    });

    await expect(
      codeOf(() =>
        service.start("operator-1", {
          scenarioVersionId: VERSION_ID,
          eventId: START_EVENT_ID,
        }),
      ),
    ).resolves.toBe(ErrorCodes.DDS_SCENARIO_NOT_READY);
  });

  it("requires comments for negative statuses", async () => {
    const { service, store } = createService();

    await expect(
      codeOf(() =>
        service.transition(EXERCISE_ID, "operator-1", {
          eventId: TRANSITION_EVENT_ID,
          status: "not_accepted",
        }),
      ),
    ).resolves.toBe(ErrorCodes.DDS_STATUS_COMMENT_REQUIRED);
    expect(store.appendTransition).not.toHaveBeenCalled();
  });

  it("returns the stored projection when a transition command is retried", async () => {
    const completed = stored({
      status: "completed",
      acknowledgedAt: new Date("2026-09-15T12:00:10.000Z"),
      completedAt: new Date("2026-09-15T12:04:00.000Z"),
    });
    const { service, store } = createService({
      findOwnByTransitionEvent: jest.fn().mockResolvedValue(completed),
    });

    await expect(
      service.transition(EXERCISE_ID, "operator-1", {
        eventId: TRANSITION_EVENT_ID,
        status: "completed",
      }),
    ).resolves.toMatchObject({ status: "completed", result: { score: 100 } });
    expect(store.loadOwn).not.toHaveBeenCalled();
    expect(store.appendTransition).not.toHaveBeenCalled();
  });

  it("records the first response as the acknowledgement timestamp", async () => {
    const { service, store } = createService();

    await service.transition(EXERCISE_ID, "operator-1", {
      eventId: TRANSITION_EVENT_ID,
      status: "accepted",
    });

    expect(store.appendTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: "pending",
        nextStatus: "accepted",
        acknowledgedAt: expect.any(Date),
      }),
    );
  });

  it("does not allow a client to skip response stages", async () => {
    const { service, store } = createService({
      loadOwn: jest.fn().mockResolvedValue(stored({ status: "accepted" })),
    });

    await expect(
      codeOf(() =>
        service.transition(EXERCISE_ID, "operator-1", {
          eventId: TRANSITION_EVENT_ID,
          status: "completed",
        }),
      ),
    ).resolves.toBe(ErrorCodes.DDS_STATUS_TRANSITION_INVALID);
    expect(store.appendTransition).not.toHaveBeenCalled();
  });

  it("turns a concurrent state change into a stable domain conflict", async () => {
    const { service } = createService({
      appendTransition: jest.fn().mockResolvedValue({ kind: "stale" }),
    });

    await expect(
      codeOf(() =>
        service.transition(EXERCISE_ID, "operator-1", {
          eventId: TRANSITION_EVENT_ID,
          status: "accepted",
        }),
      ),
    ).resolves.toBe(ErrorCodes.DDS_STATUS_TRANSITION_CONFLICT);
  });

  it("recognizes a concurrent duplicate instead of returning a conflict", async () => {
    const completed = stored({
      status: "completed",
      acknowledgedAt: new Date("2026-09-15T12:00:10.000Z"),
      completedAt: new Date("2026-09-15T12:04:00.000Z"),
    });
    const { service } = createService({
      findOwnByTransitionEvent: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(completed),
      appendTransition: jest.fn().mockResolvedValue({ kind: "stale" }),
    });

    await expect(
      service.transition(EXERCISE_ID, "operator-1", {
        eventId: TRANSITION_EVENT_ID,
        status: "accepted",
      }),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("hides another trainee's exercise as a missing one", async () => {
    const { service } = createService({
      loadOwn: jest.fn().mockResolvedValue(null),
    });

    await expect(
      codeOf(() => service.get(EXERCISE_ID, "operator-2")),
    ).resolves.toBe(ErrorCodes.DDS_EXERCISE_NOT_FOUND);
  });

  it("presents allowed transitions without exposing persistence fields", async () => {
    const { service } = createService();

    await expect(service.get(EXERCISE_ID, "operator-1")).resolves.toMatchObject<
      Partial<DdsExercise>
    >({
      status: "pending",
      allowedTransitions: ["accepted", "not_accepted"],
      result: null,
    });
  });

  describe("with a crew handoff over the phone", () => {
    const crews = [{ callsign: "ПСЧ-12", phoneNumber: "1012" }];
    const call = (
      overrides: Partial<StoredCrewHandoff["calls"][number]> = {},
    ): StoredCrewHandoff["calls"][number] => ({
      dialedNumber: "1012",
      callsign: "ПСЧ-12",
      startedAt: new Date("2026-09-15T12:00:40.000Z"),
      endedAt: new Date("2026-09-15T12:01:10.000Z"),
      outcome: "completed",
      correct: true,
      acknowledgements: 3,
      transcript: "Москва, улица Учебная, дом 12",
      validation: {
        complete: true,
        coveredFields: ["address", "incident", "description", "victims"],
        missingFields: [],
      },
      asrStatus: "completed",
      purpose: "handoff",
      reportedStatus: null,
      reportText: null,
      ...overrides,
    });
    const handoffs = (calls: StoredCrewHandoff["calls"]) =>
      jest.fn().mockResolvedValue(new Map([[EXERCISE_ID, { crews, calls }]]));
    const accepted = () =>
      jest.fn().mockResolvedValue(
        stored({
          status: "accepted",
          acknowledgedAt: new Date("2026-09-15T12:00:20.000Z"),
        }),
      );

    it("does not let the crew respond before anyone called it", async () => {
      const { service, store } = createService(
        { loadOwn: accepted(), loadCrewHandoffs: handoffs([]) },
        true,
      );

      expect(
        await codeOf(() =>
          service.transition(EXERCISE_ID, "operator-1", {
            eventId: TRANSITION_EVENT_ID,
            status: "responding",
          }),
        ),
      ).toBe(ErrorCodes.DDS_CREW_NOT_NOTIFIED);
      expect(store.appendTransition).not.toHaveBeenCalled();
    });

    it("does not count a call to the wrong service", async () => {
      const { service } = createService(
        {
          loadOwn: accepted(),
          loadCrewHandoffs: handoffs([
            call({ dialedNumber: "1035", callsign: "СМП-35", correct: false }),
          ]),
        },
        true,
      );

      expect(
        await codeOf(() =>
          service.transition(EXERCISE_ID, "operator-1", {
            eventId: TRANSITION_EVENT_ID,
            status: "responding",
          }),
        ),
      ).toBe(ErrorCodes.DDS_CREW_NOT_NOTIFIED);
    });

    it("lets the crew respond once the right crew took the card", async () => {
      const { service, store } = createService(
        { loadOwn: accepted(), loadCrewHandoffs: handoffs([call()]) },
        true,
      );

      await service.transition(EXERCISE_ID, "operator-1", {
        eventId: TRANSITION_EVENT_ID,
        status: "responding",
      });

      expect(store.appendTransition).toHaveBeenCalledWith(
        expect.objectContaining({ nextStatus: "responding" }),
      );
    });

    it("still allows a refusal without a call", async () => {
      const { service, store } = createService(
        { loadOwn: accepted(), loadCrewHandoffs: handoffs([]) },
        true,
      );

      await service.transition(EXERCISE_ID, "operator-1", {
        eventId: TRANSITION_EVENT_ID,
        status: "refused",
        comment: "Карточка адресована не нашей службе",
      });

      expect(store.appendTransition).toHaveBeenCalledWith(
        expect.objectContaining({ nextStatus: "refused" }),
      );
    });

    it("shows the crews of the service and the calls made", async () => {
      const { service } = createService(
        {
          listByOperator: jest.fn().mockResolvedValue([stored()]),
          loadCrewHandoffs: handoffs([
            call({
              dialedNumber: "1999",
              callsign: null,
              outcome: "unknown_number",
              correct: false,
            }),
            call(),
          ]),
        },
        true,
      );

      const [exercise] = await service.list("operator-1");

      expect(exercise!.crewHandoff).toEqual({
        notified: true,
        crews,
        callMode: null,
        nextReportStatus: null,
        selectedCrewPhoneNumber: "1012",
        calls: [
          expect.objectContaining({ dialedNumber: "1999", correct: false }),
          expect.objectContaining({ dialedNumber: "1012", correct: true }),
        ],
      });
    });

    it("requires the matching crew report before each progress status", async () => {
      const responding = jest.fn().mockResolvedValue(
        stored({
          status: "responding",
          acknowledgedAt: new Date("2026-09-15T12:00:20.000Z"),
        }),
      );
      const { service, store } = createService(
        {
          loadOwn: responding,
          loadCrewHandoffs: handoffs([call()]),
        },
        true,
      );

      expect(
        await codeOf(() =>
          service.transition(EXERCISE_ID, "operator-1", {
            eventId: TRANSITION_EVENT_ID,
            status: "arrived",
          }),
        ),
      ).toBe(ErrorCodes.DDS_CREW_REPORT_REQUIRED);
      expect(store.appendTransition).not.toHaveBeenCalled();
    });

    it("moves to the reported status after a completed control call", async () => {
      const responding = jest.fn().mockResolvedValue(
        stored({
          status: "responding",
          acknowledgedAt: new Date("2026-09-15T12:00:20.000Z"),
        }),
      );
      const { service, store } = createService(
        {
          loadOwn: responding,
          loadCrewHandoffs: handoffs([
            call(),
            call({
              purpose: "progress_check",
              reportedStatus: "arrived",
              reportText: "ПСЧ-12. Прибыли по адресу.",
            }),
          ]),
        },
        true,
      );

      await service.transition(EXERCISE_ID, "operator-1", {
        eventId: TRANSITION_EVENT_ID,
        status: "arrived",
      });

      expect(store.appendTransition).toHaveBeenCalledWith(
        expect.objectContaining({ nextStatus: "arrived" }),
      );
    });

    it("stays silent about telephony when it is off", async () => {
      const { service, store } = createService({
        listByOperator: jest.fn().mockResolvedValue([stored()]),
      });

      const [exercise] = await service.list("operator-1");

      expect(exercise!.crewHandoff).toBeNull();
      expect(store.loadCrewHandoffs).not.toHaveBeenCalled();
    });
  });

  describe("attempts assigned by an instructor", () => {
    const closed = () =>
      stored({
        status: "accepted",
        trainingAttemptId: "attempt-1",
        completedAt: new Date("2026-09-15T12:05:00.000Z"),
      });

    it("refuses a transition after the instructor closed the attempt", async () => {
      const { service } = createService({
        loadOwn: jest.fn().mockResolvedValue(closed()),
      });

      expect(
        await codeOf(() =>
          service.transition(EXERCISE_ID, "operator-1", {
            eventId: TRANSITION_EVENT_ID,
            status: "responding",
          }),
        ),
      ).toBe(ErrorCodes.DDS_STATUS_TRANSITION_INVALID);
    });

    it("offers no transitions on a closed attempt", async () => {
      const { service } = createService({
        loadOwn: jest.fn().mockResolvedValue(closed()),
      });

      expect(
        (await service.get(EXERCISE_ID, "operator-1")).allowedTransitions,
      ).toEqual([]);
    });

    it("reads the instructor cabinet in one batch", async () => {
      const { service, store } = createService({
        listByIds: jest.fn().mockResolvedValue([stored()]),
      });

      const presented = await service.presentByIds([EXERCISE_ID]);

      expect(store.listByIds).toHaveBeenCalledWith([EXERCISE_ID]);
      expect(presented.get(EXERCISE_ID)?.id).toBe(EXERCISE_ID);
    });

    it("shows crew handoff for an assigned card attempt", async () => {
      const assigned = stored({ trainingAttemptId: "attempt-1" });
      const assignedCrews = [{ callsign: "ПСЧ-12", phoneNumber: "1012" }];
      const { service, store } = createService(
        {
          listByIds: jest.fn().mockResolvedValue([assigned]),
          loadCrewHandoffs: jest
            .fn()
            .mockResolvedValue(
              new Map([[EXERCISE_ID, { crews: assignedCrews, calls: [] }]]),
            ),
        },
        true,
      );

      const presented = await service.presentByIds([EXERCISE_ID]);

      expect(presented.get(EXERCISE_ID)?.crewHandoff).toEqual({
        notified: false,
        crews: assignedCrews,
        calls: [],
        callMode: null,
        nextReportStatus: null,
        selectedCrewPhoneNumber: null,
      });
      expect(store.loadCrewHandoffs).toHaveBeenCalledWith([assigned]);
    });
  });
});
