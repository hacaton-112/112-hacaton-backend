import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";
import type { IncidentCardStore } from "@/modules/incident-card/ports/incident-card.store.port";
import type { ClassifierService } from "@/modules/classifier/application/classifier.service";

import { IncidentCardService } from "@/modules/incident-card/application/incident-card.service";

const card = (overrides: Partial<IncidentCard> = {}): IncidentCard =>
  ({
    trainingSessionId: "session-1",
    callerAnonymous: false,
    categories: [],
    services: [],
    victims: [],
    nearby: false,
    submittedAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as IncidentCard;

interface StoreMocks {
  findCall: jest.Mock;
  load: jest.Mock;
  save: jest.Mock;
  submit: jest.Mock;
}

interface ClassifierMocks {
  routeActive: jest.Mock;
  routeStored: jest.Mock;
}

const classifierResult = {
  routing: {
    classifierVersionId: "7d382312-d69e-4f10-8c77-f7b795707ccd",
    classifierEntryId: "52a2fb62-356f-49c0-a621-882af11e45c8",
    sourceCode: "12001",
    featurePath: ["Пожар"],
    finalType: "Пожар в жилом доме",
    ekpType: "ПОЖАР",
    mainServiceCode: "01",
    qualifierCodes: [],
    requiredServices: [
      { code: "svc_fire", name: "Пожарная охрана", routeLabel: "Выезд" },
    ],
  },
  availableQualifiers: [],
} as const;

const createService = (
  overrides: Partial<StoreMocks> = {},
  classifierOverrides: Partial<ClassifierMocks> = {},
): {
  service: IncidentCardService;
  store: StoreMocks;
  classifier: ClassifierMocks;
} => {
  const store: StoreMocks = {
    findCall: jest
      .fn()
      .mockResolvedValue({ operatorId: "operator-1", isOver: false }),
    load: jest.fn().mockResolvedValue(card()),
    save: jest.fn().mockImplementation(async () => card()),
    submit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const classifier: ClassifierMocks = {
    routeActive: jest.fn().mockResolvedValue(classifierResult),
    routeStored: jest.fn().mockResolvedValue(classifierResult),
    ...classifierOverrides,
  };

  return {
    service: new IncidentCardService(
      store as unknown as IncidentCardStore,
      classifier as unknown as ClassifierService,
    ),
    store,
    classifier,
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

describe(IncidentCardService.name, () => {
  it("gives an empty card before the operator has written anything", async () => {
    const { service } = createService({
      load: jest.fn().mockResolvedValue(null),
    });

    await expect(service.get("session-1", "operator-1")).resolves.toMatchObject(
      {
        trainingSessionId: "session-1",
        country: null,
        federalSubject: null,
        city: null,
        settlement: null,
        administrativeDistrict: null,
        street: null,
        house: null,
        building: null,
        corpus: null,
        apartment: null,
        categories: [],
        services: [],
        victims: [],
      },
    );
  });

  it("saves what the operator typed while the call runs", async () => {
    const { service, store } = createService();

    await service.save("session-1", "operator-1", {
      addressText: "улица Учебная, дом 12, квартира 34",
      city: "Москва",
      street: "Учебная улица",
      house: "12",
      apartment: "34",
      services: ["dds_01"],
    });

    expect(store.save).toHaveBeenCalledWith("session-1", {
      addressText: "улица Учебная, дом 12, квартира 34",
      city: "Москва",
      street: "Учебная улица",
      house: "12",
      apartment: "34",
      services: ["dds_01"],
    });
  });

  it("stores the backend routing snapshot and ignores a forged final type", async () => {
    const { service, store, classifier } = createService();

    await service.save("session-1", "operator-1", {
      classifierEntryId: classifierResult.routing.classifierEntryId,
      classifierQualifierCodes: [],
      incidentType: "Подменено клиентом",
    });

    expect(classifier.routeActive).toHaveBeenCalledWith(
      classifierResult.routing.classifierEntryId,
      [],
    );
    expect(store.save).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        incidentType: "Пожар в жилом доме",
        classifierRouting: classifierResult.routing,
        services: ["dds_01"],
      }),
    );
  });

  it("keeps classifier services when the operator changes manual routing", async () => {
    const current = card({
      classifierEntryId: classifierResult.routing.classifierEntryId,
      classifierQualifierCodes: [],
      classifierRouting: classifierResult.routing,
      incidentType: classifierResult.routing.finalType,
      services: ["dds_01", "zhkh"],
    });
    const { service, store } = createService({
      load: jest.fn().mockResolvedValue(current),
    });

    await service.save("session-1", "operator-1", {
      incidentType: "Пожар в жилом доме",
      services: ["zhkh"],
    });

    expect(store.save).toHaveBeenCalledWith("session-1", {
      services: ["zhkh", "dds_01"],
    });
  });

  it("reroutes the stored immutable version when a qualifier changes", async () => {
    const current = card({
      classifierEntryId: classifierResult.routing.classifierEntryId,
      classifierQualifierCodes: [],
      classifierRouting: classifierResult.routing,
      incidentType: classifierResult.routing.finalType,
    });
    const { service, classifier } = createService({
      load: jest.fn().mockResolvedValue(current),
    });

    await service.save("session-1", "operator-1", {
      classifierQualifierCodes: ["q_people"],
    });

    expect(classifier.routeStored).toHaveBeenCalledWith(
      classifierResult.routing.classifierEntryId,
      ["q_people"],
    );
    expect(classifier.routeActive).not.toHaveBeenCalled();
  });

  it("does not let a later patch overwrite a classified final type", async () => {
    const current = card({
      classifierEntryId: classifierResult.routing.classifierEntryId,
      classifierQualifierCodes: [],
      classifierRouting: classifierResult.routing,
      incidentType: classifierResult.routing.finalType,
    });
    const { service, store } = createService({
      load: jest.fn().mockResolvedValue(current),
    });

    await service.save("session-1", "operator-1", {
      incidentType: "Подменено клиентом",
      description: "Описание оператора",
    });

    expect(store.save).toHaveBeenCalledWith("session-1", {
      description: "Описание оператора",
    });
  });

  it("refuses to write into the card of a finished call", async () => {
    const { service, store } = createService({
      findCall: jest
        .fn()
        .mockResolvedValue({ operatorId: "operator-1", isOver: true }),
    });

    // Дописанное после разговора оценивать нечестно: разбор судит по тому, что
    // оператор успел записать во время звонка.
    await expect(
      codeOf(() =>
        service.save("session-1", "operator-1", { district: "СЗАО" }),
      ),
    ).resolves.toBe(ErrorCodes.INCIDENT_CARD_CLOSED);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("hides another operator's call behind the same answer as a missing one", async () => {
    const { service, store } = createService({
      findCall: jest
        .fn()
        .mockResolvedValue({ operatorId: "someone-else", isOver: false }),
    });

    // Иначе по коду ответа можно перебирать чужие идентификаторы сессий.
    await expect(
      codeOf(() => service.get("session-1", "operator-1")),
    ).resolves.toBe(ErrorCodes.CALL_NOT_FOUND);
    await expect(
      codeOf(() =>
        service.save("session-1", "operator-1", { district: "СЗАО" }),
      ),
    ).resolves.toBe(ErrorCodes.CALL_NOT_FOUND);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("says the same about a call that never existed", async () => {
    const { service } = createService({
      findCall: jest.fn().mockResolvedValue(null),
    });

    await expect(
      codeOf(() => service.get("session-1", "operator-1")),
    ).resolves.toBe(ErrorCodes.CALL_NOT_FOUND);
  });

  it("closes the card when the call ends", async () => {
    const { service, store } = createService();

    await service.close("session-1");

    expect(store.submit).toHaveBeenCalledWith("session-1", expect.any(Date));
  });
});
