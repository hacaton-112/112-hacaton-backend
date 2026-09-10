import type { CallerReply } from "@/contracts";

import { ScenarioEngineError } from "../domain/scenario-engine.error";
import type {
  CallStateSnapshot,
  ScenarioStore,
  ScenarioVersionSnapshot,
} from "../ports/scenario-store.port";
import { ScenarioEngineService } from "./scenario-engine.service";

const NOW = new Date("2026-09-08T10:00:00.000Z");
const secondsAfter = (seconds: number): Date =>
  new Date(NOW.getTime() + seconds * 1_000);

const version = (
  overrides: Partial<ScenarioVersionSnapshot> = {},
): ScenarioVersionSnapshot => ({
  id: "version-1",
  scenarioCode: "S-015",
  title: "Пожар в жилом доме",
  category: "fire",
  difficulty: 3,
  isPublished: true,
  panicFloor: 1,
  panicCeiling: 4,
  maxInterruptions: 3,
  initiativeCooldownSeconds: 12,
  answerNormSeconds: 240,
  passThreshold: 75,
  expectedServices: ["fire"],
  openingLine: "Горит квартира!",
  fallbackLine: "Повторите, вас плохо слышно.",
  persona: {
    displayName: "Мужчина, 34 года",
    gender: "male" as const,
    ageYears: 34,
    condition: "Волнение, быстрая речь",
    speechStyle: "Говорит рублеными фразами.",
    backgroundSounds: "Двор, крики",
    voiceId: "Vivian",
    baselinePanicLevel: 2,
    baseSpeechRate: 1,
  },
  facts: [
    {
      key: "incident_type",
      promptValue: "Горит квартира на пятом этаже.",
      severity: "normal",
      disclosure: { type: "immediate" },
      priority: 5,
      orderIndex: 0,
    },
    {
      key: "address_street",
      promptValue: "Улица Учебная, дом 12.",
      severity: "normal",
      disclosure: { type: "on_question", keywords: ["адрес", "улиц"] },
      priority: 3,
      orderIndex: 1,
    },
    {
      key: "trapped_children",
      promptValue: "В квартире двое детей.",
      severity: "heavy",
      disclosure: { type: "immediate" },
      priority: 1,
      orderIndex: 2,
    },
  ],
  escalationRules: [
    {
      trigger: "operator_silence",
      direction: "up",
      cooldownSeconds: 10,
      seconds: 8,
    },
    { trigger: "heavy_fact_revealed", direction: "up", cooldownSeconds: 0 },
    {
      trigger: "calming_phrase",
      direction: "down",
      cooldownSeconds: 0,
      keywords: ["помощь уже", "я вас слышу", "бригада выехала"],
    },
    {
      // Диспетчеров 112 учат не говорить «успокойтесь»: сценарий это наказывает.
      trigger: "forbidden_phrase",
      direction: "up",
      cooldownSeconds: 0,
      keywords: ["успокойтесь", "не кричите"],
    },
  ],
  mandatoryQuestions: [
    {
      orderIndex: 0,
      text: "Точный адрес",
      satisfiedByFactKeys: ["address_street"],
      isCritical: true,
    },
    {
      orderIndex: 1,
      text: "Есть ли люди внутри",
      satisfiedByFactKeys: ["trapped_children"],
      isCritical: true,
    },
  ],
  locator: {
    centerLat: 55.75201,
    centerLon: 37.6159,
    radiusMeters: 300,
    label: "Мобильный · базовая станция СЗАО",
    accuracy: "identified",
    callerNumber: "+7 916 000-00-00",
    previouslyCalled: false,
  },
  ...overrides,
});

const callState = (
  overrides: Partial<CallStateSnapshot> = {},
): CallStateSnapshot => ({
  trainingSessionId: "session-1",
  scenarioVersionId: "version-1",
  operatorId: "operator-1",
  stage: "conversation",
  panicLevel: 2,
  panicChangedAt: null,
  rngSeed: "seed-1",
  interruptionsUsed: 0,
  lastInitiativeAt: null,
  operatorSilenceSince: NOW,
  revealedFactKeys: [],
  callerTurns: 0,
  offeredAt: NOW,
  answeredAt: NOW,
  endedAt: null,
  lastSequence: 3,
  ...overrides,
});

interface StoreMocks {
  loadVersion: jest.Mock;
  loadCall: jest.Mock;
  startCall: jest.Mock;
  appendTurn: jest.Mock;
  loadRecentTurns: jest.Mock;
}

const createEngine = (
  overrides: Partial<StoreMocks> = {},
): { engine: ScenarioEngineService; store: StoreMocks } => {
  const store: StoreMocks = {
    loadVersion: jest.fn().mockResolvedValue(version()),
    loadCall: jest.fn().mockResolvedValue(callState()),
    startCall: jest.fn().mockResolvedValue("applied"),
    appendTurn: jest.fn().mockResolvedValue("applied"),
    loadRecentTurns: jest.fn().mockResolvedValue([]),
    ...overrides,
  };

  return {
    engine: new ScenarioEngineService(store as unknown as ScenarioStore),
    store,
  };
};

const reply = (overrides: Partial<CallerReply> = {}): CallerReply => ({
  text: "Горит квартира!",
  emotion: "panic",
  intensity: 0.8,
  speechRate: 1.2,
  revealedFactIds: [],
  endCall: false,
  ...overrides,
});

const eventTypes = (store: StoreMocks, call = 0): string[] =>
  (store.appendTurn.mock.calls[call]?.[2] as { type: string }[]).map(
    (event) => event.type,
  );

const patchOf = (store: StoreMocks, call = 0): Record<string, unknown> =>
  store.appendTurn.mock.calls[call]?.[3] as Record<string, unknown>;

describe(`${ScenarioEngineService.name} startCall`, () => {
  it("opens the call at the persona baseline, clamped to the scenario floor", async () => {
    const { engine, store } = createEngine({
      loadVersion: jest
        .fn()
        .mockResolvedValue(version({ panicFloor: 3, panicCeiling: 4 })),
    });

    const snapshot = await engine.startCall({
      trainingSessionId: "session-1",
      scenarioVersionId: "version-1",
      eventId: "event-1",
      now: NOW,
    });

    expect(snapshot.stage).toBe("offered");
    expect(snapshot.panicLevel).toBe(3);
    expect(store.startCall).toHaveBeenCalled();
  });

  it("refuses to start a version that is not published", async () => {
    const { engine, store } = createEngine({
      loadVersion: jest.fn().mockResolvedValue(version({ isPublished: false })),
    });

    await expect(
      engine.startCall({
        trainingSessionId: "session-1",
        scenarioVersionId: "version-1",
        eventId: "event-1",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "scenario-version-not-published" });

    expect(store.startCall).not.toHaveBeenCalled();
  });

  it("hands the operator an area, never the exact address", async () => {
    const { engine } = createEngine();

    const snapshot = await engine.startCall({
      trainingSessionId: "session-1",
      scenarioVersionId: "version-1",
      eventId: "event-1",
      now: NOW,
    });

    expect(snapshot.locator?.radiusMeters).toBe(300);
    expect(JSON.stringify(snapshot)).not.toContain("Учебная");
  });
});

describe(`${ScenarioEngineService.name} startCall on a used session`, () => {
  it("answers a repeated command with the call it already opened", async () => {
    const { engine } = createEngine({
      startCall: jest.fn().mockResolvedValue("duplicate"),
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "offered" })),
    });

    await expect(
      engine.startCall({
        trainingSessionId: "session-1",
        scenarioVersionId: "version-1",
        eventId: "event-1",
      }),
    ).resolves.toMatchObject({ stage: "offered" });
  });

  it("refuses a second call rather than passing off the old one as new", async () => {
    const { engine } = createEngine({
      startCall: jest.fn().mockResolvedValue("duplicate"),
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "declined" })),
    });

    await expect(
      engine.startCall({
        trainingSessionId: "session-1",
        scenarioVersionId: "version-1",
        eventId: "event-2",
      }),
    ).rejects.toThrow(ScenarioEngineError);
  });
});

describe(`${ScenarioEngineService.name} stage transitions`, () => {
  it("answers an offered call and returns the scripted opening line", async () => {
    const { engine, store } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "offered" })),
    });

    const snapshot = await engine.acceptCall({
      trainingSessionId: "session-1",
      eventId: "event-2",
      now: NOW,
    });

    expect(snapshot.stage).toBe("conversation");
    expect(snapshot.openingLine).toBe("Горит квартира!");
    expect(eventTypes(store)).toEqual(["call.accepted", "stage.changed"]);
  });

  it("refuses to answer a call that is already in conversation", async () => {
    const { engine } = createEngine();

    await expect(
      engine.acceptCall({
        trainingSessionId: "session-1",
        eventId: "event-2",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "call-stage-forbidden" });
  });

  it("refuses any command once the call has ended", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "ended" })),
    });

    await expect(
      engine.applyCallerReply({
        trainingSessionId: "session-1",
        eventId: "event-3",
        operatorText: "Что случилось?",
        reply: reply(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "call-not-active" });
  });
});

describe(`${ScenarioEngineService.name} buildGenerationContext`, () => {
  it("passes only the facts the caller may reveal this turn", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Что случилось?",
    });

    // Second step allows two new facts, and the address is still behind a
    // question the operator has not asked.
    expect(built.context.allowedFacts.map((fact) => fact.id)).toEqual([
      "incident_type",
      "trapped_children",
    ]);
  });

  it("opens a question fact once the operator asks for it", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Назовите адрес",
    });

    expect(built.context.allowedFacts.map((fact) => fact.id)).toContain(
      "address_street",
    );
  });

  it("narrows the turn to a single fact when the caller is panicking", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 4 })),
    });

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Назовите адрес",
    });

    expect(built.context.allowedFacts).toHaveLength(1);
  });

  it("describes the state in words rather than as a number", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Что случилось?",
    });

    expect(built.context.persona.description).toContain("взвинчен");
    expect(built.context.persona.description).not.toContain("2");
  });
});

describe(`${ScenarioEngineService.name} applyCallerReply`, () => {
  it("records the revealed fact and advances the checklist", async () => {
    const { engine, store } = createEngine();

    const snapshot = await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-3",
      operatorText: "Что случилось?",
      reply: reply({ revealedFactIds: ["incident_type"] }),
      now: NOW,
    });

    expect(eventTypes(store)).toEqual([
      "operator.utterance",
      "caller.reply",
      "fact.revealed",
    ]);
    expect(snapshot.revealedFactKeys).toEqual(["incident_type"]);
    expect(snapshot.checklistTotal).toBe(2);
    expect(snapshot.checklistSatisfied).toBe(0);
  });

  it("rejects a reply that reveals a fact the scenario did not allow", async () => {
    const { engine, store } = createEngine();

    await expect(
      engine.applyCallerReply({
        trainingSessionId: "session-1",
        eventId: "event-3",
        operatorText: "Что случилось?",
        reply: reply({ revealedFactIds: ["address_street"] }),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ScenarioEngineError);

    // The attempt is journalled as a prompt-quality signal, and nothing about
    // the call state moves.
    expect(eventTypes(store)).toEqual(["fact.rejected"]);
    expect(patchOf(store)).toEqual({});
  });

  it("raises the step once when a heavy fact is spoken aloud", async () => {
    const { engine, store } = createEngine();

    const snapshot = await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-3",
      operatorText: "Есть ли кто внутри?",
      reply: reply({ revealedFactIds: ["trapped_children"] }),
      now: NOW,
    });

    expect(snapshot.panicLevel).toBe(3);
    expect(eventTypes(store)).toContain("panic.changed");
  });

  it("does not raise the step again when the same fact is repeated", async () => {
    const { engine } = createEngine({
      loadCall: jest
        .fn()
        .mockResolvedValue(
          callState({ revealedFactKeys: ["trapped_children"] }),
        ),
    });

    const snapshot = await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-4",
      operatorText: "Повторите про детей",
      reply: reply({ revealedFactIds: ["trapped_children"] }),
      now: NOW,
    });

    expect(snapshot.panicLevel).toBe(2);
  });

  it("lets a calming phrase bring the caller down a step", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 3 })),
    });

    const snapshot = await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-3",
      operatorText: "Помощь уже выехала, я вас слышу",
      reply: reply(),
      now: NOW,
    });

    expect(snapshot.panicLevel).toBe(2);
  });

  it("never drops below the floor the scenario sets", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 1 })),
    });

    const snapshot = await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-3",
      operatorText: "Помощь уже выехала",
      reply: reply(),
      now: NOW,
    });

    expect(snapshot.panicLevel).toBe(1);
  });
});

describe(`${ScenarioEngineService.name} initiative`, () => {
  it("journals the caller speaking up instead of an operator utterance", async () => {
    const { engine, store } = createEngine();

    await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-5",
      operatorText: "(оператор молчит)",
      reply: reply(),
      initiative: true,
      now: NOW,
    });

    // Реплики оператора не было — записать её значило бы соврать в расшифровке.
    expect(eventTypes(store)).toEqual(["caller.initiative", "caller.reply"]);
  });

  it("keeps the silence running and remembers when the caller spoke", async () => {
    const { engine, store } = createEngine();

    await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-5",
      operatorText: "(оператор молчит)",
      reply: reply(),
      initiative: true,
      now: NOW,
    });

    const patch = patchOf(store);

    // Оператор всё ещё молчит, поэтому отсчёт не сбрасывается; от повторов
    // защищает пауза между инициативами.
    expect(patch.operatorSilenceSince).toBeUndefined();
    expect(patch.lastInitiativeAt).toEqual(NOW);
  });

  it("opens no question facts, because no question was asked", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Назовите адрес",
      initiative: true,
    });

    expect(built.context.allowedFacts.map((fact) => fact.id)).not.toContain(
      "address_street",
    );
    expect(built.context.persona.description).toContain("Оператор молчит");
  });
});

describe(`${ScenarioEngineService.name} the operator's own words`, () => {
  it("keeps a fired rule in the journal even at the top of the scale", async () => {
    const { engine, store } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 4 })),
    });

    await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-1",
      operatorText: "Успокойтесь, я вас прошу.",
      reply: reply(),
    });

    // Ступень уже на потолке, двигать её некуда — но ошибку оператора разбор
    // занятия должен увидеть.
    expect(eventTypes(store)).toContain("escalation.fired");
  });

  it("does not repeat a rule that actually moved the step", async () => {
    const { engine, store } = createEngine();

    await engine.applyCallerReply({
      trainingSessionId: "session-1",
      eventId: "event-1",
      operatorText: "Успокойтесь, я вас прошу.",
      reply: reply(),
    });

    expect(eventTypes(store)).toContain("panic.changed");
    expect(eventTypes(store)).not.toContain("escalation.fired");
  });

  it("tells the caller that he was told to calm down", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Успокойтесь, мы вызвали пожарную.",
    });

    expect(built.context.persona.description).toContain("только злит");
  });

  it("tells the caller that help is on the way when it is", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Я вас слышу, бригада выехала.",
    });

    expect(built.context.persona.description).toContain("чуть легче");
  });

  it("describes how the caller speaks, not only how he feels", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Что произошло?",
    });

    expect(built.context.persona.description).toContain("Как говорит:");
    expect(built.context.persona.description).toContain(
      "Так звучат его реплики:",
    );
  });
});

describe(`${ScenarioEngineService.name} voice and memory`, () => {
  it("gives the model the turns that already happened", async () => {
    const turns = [
      { role: "operator" as const, text: "Что у вас случилось?" },
      { role: "caller" as const, text: "Горит квартира!" },
    ];
    const { engine, store } = createEngine({
      loadRecentTurns: jest.fn().mockResolvedValue(turns),
    });

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Назовите адрес.",
    });

    // Без этого заявитель отвечает так, будто звонок только начался, и
    // повторяет одну и ту же первую фразу.
    expect(built.context.recentTurns).toEqual(turns);
    expect(store.loadRecentTurns).toHaveBeenCalledWith("session-1", 8);
  });

  it("lets the step of panic drive the voice, not the model", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 4 })),
    });

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Успокойтесь.",
    });

    expect(built.voice).toMatchObject({
      gender: "male",
      emotion: "panic",
    });
    expect(built.voice.intensity).toBeGreaterThan(0.8);
    expect(built.voice.speechRate).toBeGreaterThan(1);
  });

  it("speaks calmly at the bottom of the scale", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 0 })),
    });

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Что произошло?",
    });

    expect(built.voice.emotion).toBe("calm");
    expect(built.voice.intensity).toBeLessThan(0.3);
  });

  it("keeps the voice of the persona the scenario cast", async () => {
    const { engine } = createEngine();

    const built = await engine.buildGenerationContext({
      trainingSessionId: "session-1",
      operatorText: "Что произошло?",
    });

    // Мужчина не должен говорить женским голосом: занятие рассыпается
    // быстрее, чем от любой ошибки в тексте.
    expect(built.voice.gender).toBe("male");
    expect(built.voice.voiceId).toBe("Vivian");
  });
});

describe(`${ScenarioEngineService.name} setOperatorSpeaking`, () => {
  it("holds the silence timer while the operator has the floor", async () => {
    const { engine, store } = createEngine();

    await engine.setOperatorSpeaking({
      trainingSessionId: "session-1",
      speaking: true,
      now: secondsAfter(2),
    });

    expect(patchOf(store)).toEqual({ operatorSilenceSince: null });
    expect(eventTypes(store)).toEqual([]);
  });

  it("starts the silence over when the operator stops speaking", async () => {
    const { engine, store } = createEngine();
    const now = secondsAfter(7);

    await engine.setOperatorSpeaking({
      trainingSessionId: "session-1",
      speaking: false,
      now,
    });

    expect(patchOf(store)).toEqual({ operatorSilenceSince: now });
  });

  it("leaves a call that is not in conversation alone", async () => {
    const { engine, store } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "offered" })),
    });

    await engine.setOperatorSpeaking({
      trainingSessionId: "session-1",
      speaking: true,
    });

    expect(store.appendTurn).not.toHaveBeenCalled();
  });

  it("keeps the caller quiet for as long as the operator speaks", async () => {
    const { engine } = createEngine({
      loadCall: jest
        .fn()
        .mockResolvedValue(
          callState({ panicLevel: 3, operatorSilenceSince: null }),
        ),
    });

    await expect(
      engine.tick({ trainingSessionId: "session-1", now: secondsAfter(600) }),
    ).resolves.toEqual([]);
  });
});

describe(`${ScenarioEngineService.name} tick`, () => {
  it("does nothing while the operator keeps talking", async () => {
    const { engine, store } = createEngine();

    await expect(
      engine.tick({ trainingSessionId: "session-1", now: secondsAfter(2) }),
    ).resolves.toEqual([]);

    expect(store.appendTurn).not.toHaveBeenCalled();
  });

  it("raises the step after the silence the scenario tolerates", async () => {
    const { engine, store } = createEngine();

    await engine.tick({ trainingSessionId: "session-1", now: secondsAfter(9) });

    expect(eventTypes(store)).toEqual(["panic.changed"]);
    expect(patchOf(store)).toMatchObject({ panicLevel: 3 });
  });

  it("offers an initiative line once the caller stops waiting", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ panicLevel: 3 })),
    });

    const directives = await engine.tick({
      trainingSessionId: "session-1",
      now: secondsAfter(5),
    });

    expect(directives).toEqual([
      { type: "caller.initiative", reason: "operator-silence" },
    ]);
  });

  it("holds the initiative back until the cooldown passes", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(
        callState({
          panicLevel: 3,
          lastInitiativeAt: secondsAfter(1),
        }),
      ),
    });

    await expect(
      engine.tick({ trainingSessionId: "session-1", now: secondsAfter(6) }),
    ).resolves.toEqual([]);
  });

  it("stays quiet on a call that is not in conversation", async () => {
    const { engine } = createEngine({
      loadCall: jest.fn().mockResolvedValue(callState({ stage: "offered" })),
    });

    await expect(
      engine.tick({ trainingSessionId: "session-1", now: secondsAfter(60) }),
    ).resolves.toEqual([]);
  });
});

describe(`${ScenarioEngineService.name} endCall`, () => {
  it("closes the call and keeps what was collected", async () => {
    const { engine, store } = createEngine({
      loadCall: jest.fn().mockResolvedValue(
        callState({
          revealedFactKeys: ["address_street", "trapped_children"],
        }),
      ),
    });

    const snapshot = await engine.endCall({
      trainingSessionId: "session-1",
      eventId: "event-9",
      reason: "operator",
      now: NOW,
    });

    expect(snapshot.stage).toBe("ended");
    expect(snapshot.checklistSatisfied).toBe(2);
    expect(eventTypes(store)).toEqual(["call.ended", "stage.changed"]);
  });
});
