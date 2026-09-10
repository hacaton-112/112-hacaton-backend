import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { IncidentCard } from "../dto/incident-card.dto";
import type { IncidentCardStore } from "../ports/incident-card.store.port";

import { IncidentCardService } from "./incident-card.service";

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

const createService = (
  overrides: Partial<StoreMocks> = {},
): { service: IncidentCardService; store: StoreMocks } => {
  const store: StoreMocks = {
    findCall: jest
      .fn()
      .mockResolvedValue({ operatorId: "operator-1", isOver: false }),
    load: jest.fn().mockResolvedValue(card()),
    save: jest.fn().mockImplementation(async () => card()),
    submit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    service: new IncidentCardService(store as unknown as IncidentCardStore),
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

describe(IncidentCardService.name, () => {
  it("gives an empty card before the operator has written anything", async () => {
    const { service } = createService({
      load: jest.fn().mockResolvedValue(null),
    });

    await expect(service.get("session-1", "operator-1")).resolves.toMatchObject(
      {
        trainingSessionId: "session-1",
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
      services: ["dds_01"],
    });

    expect(store.save).toHaveBeenCalledWith("session-1", {
      addressText: "улица Учебная, дом 12, квартира 34",
      services: ["dds_01"],
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
