import type {
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
  readonly addressedService: DispatchService;
  readonly status: DdsResponseStatus;
  readonly card: DdsCardSnapshot;
  readonly acknowledgementDeadlineAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly completedAt: Date | null;
  readonly lastSequence: number;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly events: readonly DdsExerciseEvent[];
}

export interface CreateDdsExerciseInput {
  readonly id: string;
  readonly scenarioVersionId: string;
  readonly operatorId: string;
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

  loadOwn(
    exerciseId: string,
    operatorId: string,
  ): Promise<StoredDdsExercise | null>;

  appendTransition(
    input: AppendDdsTransitionInput,
  ): Promise<AppendDdsTransitionOutcome>;
}

export const DDS_EXERCISE_STORE = Symbol("DDS_EXERCISE_STORE");
