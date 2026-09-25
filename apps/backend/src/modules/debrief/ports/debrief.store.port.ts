import type {
  CallStage,
  EmergencyService,
  FactSeverity,
  IncidentCardField,
  ReferenceComparison,
} from "@/drizzle/schema";

import type { CallSummary } from "../dto/debrief.dto";

export interface DebriefCall extends CallSummary {
  readonly operatorId: string | null;
  readonly scenarioVersionId: string;
  readonly answerNormSeconds: number;
  readonly expectedDurationSeconds: number;
  readonly passThreshold: number;
  readonly difficulty: number;
  readonly expectedServices: readonly EmergencyService[];
  readonly panicLevel: number;
  readonly revealedFactKeys: readonly string[];
  readonly stage: CallStage;
}

/** Эталонная анкета сценария: с чем оценка сверяет карточку оператора. */
export interface ReferenceFieldRow {
  readonly field: IncidentCardField;
  readonly expectedValue: string;
  readonly acceptableValues: readonly string[];
  readonly comparison: ReferenceComparison;
  readonly isRequired: boolean;
}

/** Результат других операторов на том же сценарии. */
export interface GroupResult {
  readonly averageScore: number;
  readonly calls: number;
}

export interface JournalEntry {
  readonly sequence: number;
  readonly type: string;
  readonly actor: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown> | null;
}

export interface ScenarioFactRow {
  readonly key: string;
  readonly label: string;
  readonly severity: FactSeverity;
}

export interface MandatoryQuestionRow {
  readonly text: string;
  readonly isCritical: boolean;
  readonly satisfiedByFactKeys: readonly string[];
}

/**
 * Чтение всего, из чего собирается разбор.
 *
 * Порт отдельно от движка: движок ведёт звонок, а здесь его уже закончившуюся
 * историю только читают, и смешивать эти две ответственности не нужно.
 */
export interface DebriefStore {
  listCalls(operatorId: string, limit: number): Promise<readonly CallSummary[]>;
  loadCall(trainingSessionId: string): Promise<DebriefCall | null>;
  loadJournal(trainingSessionId: string): Promise<readonly JournalEntry[]>;
  loadFacts(scenarioVersionId: string): Promise<readonly ScenarioFactRow[]>;
  loadQuestions(
    scenarioVersionId: string,
  ): Promise<readonly MandatoryQuestionRow[]>;
  loadReferenceCard(
    scenarioVersionId: string,
  ): Promise<readonly ReferenceFieldRow[]>;
  loadScore(trainingSessionId: string): Promise<number | null>;
  saveScore(
    trainingSessionId: string,
    scenarioVersionId: string,
    score: number,
  ): Promise<void>;
  /** Среднее по чужим звонкам того же сценария. */
  loadGroupResult(
    scenarioVersionId: string,
    exceptTrainingSessionId: string,
  ): Promise<GroupResult>;
}

export const DEBRIEF_STORE = Symbol("DEBRIEF_STORE");
