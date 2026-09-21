import { Logger } from "@nestjs/common";

import type { ScenarioStore } from "../ports/scenario-store.port";

import { AbandonedCallJanitor } from "./abandoned-call.janitor";
import type { ScenarioEngineService } from "./scenario-engine.service";

const NOW = new Date("2026-09-12T10:00:00.000Z");

const LAST_ACTIVITY = new Date("2026-09-12T09:05:00.000Z");

const createJanitor = (
  sessions: string[],
  endCall = jest.fn().mockResolvedValue(undefined),
  stage: "offered" | "conversation" = "conversation",
  declineCall = jest.fn().mockResolvedValue(undefined),
) => {
  const abandoned = sessions.map((trainingSessionId) => ({
    trainingSessionId,
    lastActivityAt: LAST_ACTIVITY,
    stage,
  }));
  const store = {
    listAbandonedCalls: jest.fn().mockResolvedValue(abandoned),
  } as unknown as ScenarioStore;
  const engine = { endCall, declineCall } as unknown as ScenarioEngineService;

  return {
    janitor: new AbandonedCallJanitor(store, engine),
    store,
    endCall,
    declineCall,
  };
};

describe(AbandonedCallJanitor.name, () => {
  it("closes every call nobody is left on", async () => {
    const { janitor, endCall } = createJanitor(["session-1", "session-2"]);

    await expect(janitor.sweep(NOW)).resolves.toBe(2);
    expect(endCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trainingSessionId: "session-1",
        reason: "abandoned",
        // Звонок кончился, когда оператор пропал, а не когда уборка это
        // заметила: иначе в разборе он длится до самой уборки.
        now: LAST_ACTIVITY,
      }),
    );
  });

  it("declines an offer nobody took instead of ending it", async () => {
    // Завершение предложенного вызова движок не принимает, и раньше уборка
    // спотыкалась об одни и те же предложения на каждом проходе.
    const { janitor, endCall, declineCall } = createJanitor(
      ["session-1"],
      jest.fn().mockResolvedValue(undefined),
      "offered",
    );

    await expect(janitor.sweep(NOW)).resolves.toBe(1);
    expect(endCall).not.toHaveBeenCalled();
    expect(declineCall).toHaveBeenCalledWith(
      expect.objectContaining({
        trainingSessionId: "session-1",
        now: LAST_ACTIVITY,
      }),
    );
  });

  it("looks half an hour back, not at the moment the call was offered", async () => {
    const { janitor, store } = createJanitor([]);

    await janitor.sweep(NOW);

    expect(store.listAbandonedCalls).toHaveBeenCalledWith(
      new Date("2026-09-12T09:30:00.000Z"),
      expect.any(Number),
    );
  });

  it("keeps sweeping when one call refuses to close", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const endCall = jest
      .fn()
      .mockRejectedValueOnce(new Error("already ended"))
      .mockResolvedValue(undefined);
    const { janitor } = createJanitor(["session-1", "session-2"], endCall);

    await expect(janitor.sweep(NOW)).resolves.toBe(1);
    expect(endCall).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("survives a storage that refuses to answer", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const store = {
      listAbandonedCalls: jest.fn().mockRejectedValue(new Error("db is down")),
    } as unknown as ScenarioStore;
    const janitor = new AbandonedCallJanitor(
      store,
      {
        endCall: jest.fn(),
        declineCall: jest.fn(),
      } as unknown as ScenarioEngineService,
    );

    await expect(janitor.sweep(NOW)).resolves.toBe(0);
    warn.mockRestore();
  });
});
