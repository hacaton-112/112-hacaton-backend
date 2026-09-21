import type {
  CrewCallOutcome,
  DispatchService,
  EmergencyService,
  IncidentCardField,
  ScenarioCategory,
} from "@/drizzle/schema";

import type { DdsResponseStatus } from "../domain/dds-response-status";
import type {
  DdsCardSnapshot,
  DdsExerciseEvent,
} from "../dto/dds-exercise.dto";

export interface DdsScenarioReferenceField {
  readonly field: IncidentCardField;
  readonly expectedValue: string;
}

export interface DdsScenarioSource {
  readonly scenarioVersionId: string;
  readonly code: string;
  readonly title: string;
  readonly summary: string;
  readonly category: ScenarioCategory;
  readonly expectedServices: readonly EmergencyService[];
  readonly exactAddress: Readonly<Record<string, string>>;
  readonly exactLatitude: number;
  readonly exactLongitude: number;
  readonly locatorLabel: string;
  readonly callerName: string;
  readonly callerNumber: string;
  readonly referenceFields: readonly DdsScenarioReferenceField[];
}

export interface StoredDdsExercise {
  readonly id: string;
  readonly scenarioVersionId: string;
  readonly operatorId: string | null;
  readonly trainingAttemptId: string | null;
  readonly sourceTrainingSessionId: string | null;
  readonly addressedService: DispatchService;
  readonly status: DdsResponseStatus;
  readonly card: DdsCardSnapshot;
  readonly acknowledgementDeadlineAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly completedAt: Date | null;
  readonly lastSequence: number;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly passThreshold?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly events: readonly DdsExerciseEvent[];
}

export interface CreateDdsExerciseInput {
  readonly id: string;
  readonly scenarioVersionId: string;
  readonly operatorId: string;
  readonly sourceTrainingSessionId?: string;
  readonly addressedService: DispatchService;
  readonly card: DdsCardSnapshot;
  readonly startEventId: string;
  readonly createdAt: Date;
  readonly acknowledgementDeadlineAt: Date;
}

export interface AppendDdsTransitionInput {
  readonly exerciseId: string;
  readonly operatorId: string;
  readonly eventId: string;
  readonly expectedStatus: DdsResponseStatus;
  readonly expectedSequence: number;
  readonly nextStatus: DdsResponseStatus;
  readonly comment: string | null;
  readonly occurredAt: Date;
  readonly acknowledgedAt?: Date;
  readonly completedAt?: Date;
  readonly score?: number;
  readonly passed?: boolean;
}

export type AppendDdsTransitionOutcome =
  | {
      readonly kind: "updated" | "duplicate";
      readonly exercise: StoredDdsExercise;
    }
  | { readonly kind: "stale" };

export interface DdsExerciseStore {
  loadScenarioSource(
    scenarioVersionId: string,
  ): Promise<DdsScenarioSource | null>;

  findStartedByEvent(
    operatorId: string,
    startEventId: string,
  ): Promise<StoredDdsExercise | null>;

  findOwnByTransitionEvent(
    exerciseId: string,
    operatorId: string,
    eventId: string,
  ): Promise<StoredDdsExercise | null>;

  create(input: CreateDdsExerciseInput): Promise<StoredDdsExercise>;

  listByOperator(operatorId: string): Promise<readonly StoredDdsExercise[]>;

  /** Кабинет преподавателя открывает десятки попыток сразу, поэтому без запроса на каждую. */
  listByIds(
    exerciseIds: readonly string[],
  ): Promise<readonly StoredDdsExercise[]>;

  loadOwn(
    exerciseId: string,
    operatorId: string,
  ): Promise<StoredDdsExercise | null>;

  appendTransition(
    input: AppendDdsTransitionInput,
  ): Promise<AppendDdsTransitionOutcome>;

  /**
   * Доставка, которую диспетчер принял и ещё не передал наряду.
   *
   * К ней относится любой его звонок: и нужному наряду, и ошибочный набор.
   */
  findAwaitingHandoff(
    operatorId: string,
    exerciseId?: string,
  ): Promise<{
    readonly id: string;
    readonly addressedService: DispatchService;
  } | null>;

  /** Наряды службы и звонки по каждой доставке — одним запросом на список. */
  loadCrewHandoffs(
    exercises: readonly Pick<StoredDdsExercise, "id" | "addressedService">[],
  ): Promise<ReadonlyMap<string, StoredCrewHandoff>>;
}

export interface StoredCrewCall {
  readonly dialedNumber: string;
  readonly callsign: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly outcome: CrewCallOutcome | null;
  readonly correct: boolean | null;
  readonly acknowledgements: number;
}

export interface StoredCrewHandoff {
  /** Наряды службы, которой адресована карточка, — кому можно звонить. */
  readonly crews: readonly {
    readonly callsign: string;
    readonly phoneNumber: string;
  }[];
  /** Звонки по доставке, от первого к последнему. */
  readonly calls: readonly StoredCrewCall[];
}

export const DDS_EXERCISE_STORE = Symbol("DDS_EXERCISE_STORE");
