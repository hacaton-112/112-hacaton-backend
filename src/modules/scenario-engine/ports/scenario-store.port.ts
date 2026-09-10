import type { DialogueTurn } from "@/contracts";
import type {
  CallerGenderValue,
  CallEventActor,
  CallEventType,
  CallStage,
  EmergencyService,
  LocatorAccuracy,
  ScenarioCategory,
} from "@/drizzle/schema";

import type { ScenarioFact } from "../domain/disclosure";
import type { EscalationRule, PanicLevel } from "../domain/panic-scale";

export interface PersonaSnapshot {
  readonly displayName: string;
  readonly gender: CallerGenderValue;
  readonly ageYears: number;
  readonly condition: string;
  readonly speechStyle: string;
  readonly backgroundSounds: string | null;
  readonly voiceId: string;
  readonly baselinePanicLevel: PanicLevel;
  readonly baseSpeechRate: number;
}

/**
 * Что оператор видит о местоположении: область, а не точка. Точный адрес
 * остаётся фактом со своим условием раскрытия и сюда не попадает.
 */
export interface LocatorHint {
  readonly centerLat: number;
  readonly centerLon: number;
  readonly radiusMeters: number;
  readonly label: string;
  readonly accuracy: LocatorAccuracy;
  readonly callerNumber: string;
  readonly previouslyCalled: boolean;
}

export interface MandatoryQuestionSnapshot {
  readonly orderIndex: number;
  readonly text: string;
  readonly satisfiedByFactKeys: readonly string[];
  readonly isCritical: boolean;
}

/** Неизменяемый снимок правил, по которым идёт звонок. */
export interface ScenarioVersionSnapshot {
  readonly id: string;
  readonly scenarioCode: string;
  readonly title: string;
  readonly category: ScenarioCategory;
  readonly difficulty: number;
  readonly isPublished: boolean;
  readonly panicFloor: PanicLevel;
  readonly panicCeiling: PanicLevel;
  readonly maxInterruptions: number;
  readonly initiativeCooldownSeconds: number;
  readonly answerNormSeconds: number;
  readonly passThreshold: number;
  readonly expectedServices: readonly EmergencyService[];
  readonly openingLine: string;
  readonly fallbackLine: string;
  readonly persona: PersonaSnapshot;
  readonly facts: readonly ScenarioFact[];
  readonly escalationRules: readonly EscalationRule[];
  readonly mandatoryQuestions: readonly MandatoryQuestionSnapshot[];
  readonly locator: LocatorHint | null;
}

export interface CallStateSnapshot {
  readonly trainingSessionId: string;
  readonly scenarioVersionId: string;
  readonly stage: CallStage;
  readonly panicLevel: PanicLevel;
  readonly panicChangedAt: Date | null;
  readonly rngSeed: string;
  readonly interruptionsUsed: number;
  readonly lastInitiativeAt: Date | null;
  readonly operatorSilenceSince: Date | null;
  readonly revealedFactKeys: readonly string[];
  readonly callerTurns: number;
  readonly offeredAt: Date;
  readonly answeredAt: Date | null;
  readonly endedAt: Date | null;
  readonly lastSequence: number;
}

export interface NewCallEvent {
  readonly type: CallEventType;
  readonly actor: CallEventActor;
  readonly payload?: Record<string, unknown>;
  readonly occurredAt: Date;
}

/** Изменения проекции: снимок только для чтения, патч собирается по месту. */
export type CallStatePatch = {
  -readonly [
    Key in keyof Omit<
      CallStateSnapshot,
      "trainingSessionId" | "scenarioVersionId" | "rngSeed"
    >
  ]?: CallStateSnapshot[Key];
};

export type AppendOutcome = "applied" | "duplicate";

/**
 * Персистентность движка.
 *
 * Выделена в порт ради тестируемости: правила хода — это порядок проверок, а не
 * SQL, и стаб на билдер запросов проверял бы стаб. Идемпотентность живёт здесь
 * же, потому что она обеспечивается уникальным индексом, а не кодом сервиса.
 */
export interface ScenarioStore {
  loadVersion(
    scenarioVersionId: string,
  ): Promise<ScenarioVersionSnapshot | null>;

  loadCall(trainingSessionId: string): Promise<CallStateSnapshot | null>;

  /** Создаёт звонок вместе с первым событием журнала. */
  startCall(
    state: CallStateSnapshot,
    commandEventId: string,
    event: NewCallEvent,
  ): Promise<AppendOutcome>;

  /**
   * Дописывает ход: команду, производные от неё события и изменения проекции.
   *
   * Возвращает `duplicate`, если команда с таким `commandEventId` уже
   * применялась — WebSocket переподключается, и повтор доставки ожидаем.
   */
  appendTurn(
    trainingSessionId: string,
    commandEventId: string,
    events: readonly NewCallEvent[],
    patch: CallStatePatch,
  ): Promise<AppendOutcome>;

  /**
   * Последние реплики разговора, старые первыми.
   *
   * Без них модель каждый раз отвечает так, будто разговор только начался, и
   * заявитель повторяет одну и ту же фразу про горящую квартиру.
   */
  loadRecentTurns(
    trainingSessionId: string,
    limit: number,
  ): Promise<readonly DialogueTurn[]>;
}
