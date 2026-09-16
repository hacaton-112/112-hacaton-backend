import { Inject, Injectable } from "@nestjs/common";

import {
  AppBadRequestException,
  AppConflictException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";

import { buildDdsCardSnapshot } from "../domain/dds-card-snapshot";
import { evaluateDdsExercise } from "../domain/dds-exercise-evaluation";
import {
  allowedDdsTransitions,
  DdsTransitionError,
  isTerminalDdsStatus,
  validateDdsTransition,
} from "../domain/dds-response-status";
import type {
  DdsExercise,
  StartDdsExerciseRequest,
  TransitionDdsExerciseRequest,
} from "../dto/dds-exercise.dto";
import {
  DDS_EXERCISE_STORE,
  type DdsExerciseStore,
  type StoredDdsExercise,
} from "../ports/dds-exercise.store.port";

const ACKNOWLEDGEMENT_NORM_MS = 30_000;

@Injectable()
export class DdsExerciseService {
  constructor(
    @Inject(DDS_EXERCISE_STORE)
    private readonly store: DdsExerciseStore,
  ) {}

  async start(
    operatorId: string,
    request: StartDdsExerciseRequest,
  ): Promise<DdsExercise> {
    const repeated = await this.store.findStartedByEvent(
      operatorId,
      request.eventId,
    );

    if (repeated) return this.present(repeated);

    const source = await this.store.loadScenarioSource(
      request.scenarioVersionId,
    );

    if (source === null) {
      throw new AppNotFoundException(
        ErrorCodes.SCENARIO_VERSION_NOT_FOUND,
        "There is no published scenario version with this id",
      );
    }

    const card = buildDdsCardSnapshot(source);

    if (card === null) {
      throw new AppBadRequestException(
        ErrorCodes.DDS_SCENARIO_NOT_READY,
        "The scenario has no service that can receive a DDS card",
      );
    }

    const now = new Date();
    const exercise = await this.store.create({
      id: generateId(),
      scenarioVersionId: source.scenarioVersionId,
      operatorId,
      addressedService: card.addressedService,
      card: card.snapshot,
      startEventId: request.eventId,
      createdAt: now,
      acknowledgementDeadlineAt: new Date(
        now.getTime() + ACKNOWLEDGEMENT_NORM_MS,
      ),
    });

    return this.present(exercise);
  }

  async list(operatorId: string): Promise<readonly DdsExercise[]> {
    return (await this.store.listByOperator(operatorId)).map((exercise) =>
      this.present(exercise),
    );
  }

  async get(exerciseId: string, operatorId: string): Promise<DdsExercise> {
    return this.present(await this.requireOwn(exerciseId, operatorId));
  }

  async transition(
    exerciseId: string,
    operatorId: string,
    request: TransitionDdsExerciseRequest,
  ): Promise<DdsExercise> {
    const repeated = await this.store.findOwnByTransitionEvent(
      exerciseId,
      operatorId,
      request.eventId,
    );

    if (repeated) return this.present(repeated);

    const exercise = await this.requireOwn(exerciseId, operatorId);
    let comment: string | null;

    try {
      comment = validateDdsTransition({
        current: exercise.status,
        next: request.status,
        comment: request.comment,
      });
    } catch (error) {
      if (!(error instanceof DdsTransitionError)) throw error;

      if (error.reason === "comment-required") {
        throw new AppBadRequestException(
          ErrorCodes.DDS_STATUS_COMMENT_REQUIRED,
          "This DDS response status requires a comment",
        );
      }

      throw new AppConflictException(
        ErrorCodes.DDS_STATUS_TRANSITION_INVALID,
        "The requested DDS response status cannot follow the current status",
      );
    }

    const now = new Date();
    const acknowledgedAt =
      exercise.status === "pending" ? now : exercise.acknowledgedAt;
    const evaluation = evaluateDdsExercise({
      status: request.status,
      acknowledgementDeadlineAt: exercise.acknowledgementDeadlineAt,
      acknowledgedAt,
    });
    const outcome = await this.store.appendTransition({
      exerciseId,
      operatorId,
      eventId: request.eventId,
      expectedStatus: exercise.status,
      expectedSequence: exercise.lastSequence,
      nextStatus: request.status,
      comment,
      occurredAt: now,
      ...(exercise.status === "pending" ? { acknowledgedAt: now } : {}),
      ...(isTerminalDdsStatus(request.status) ? { completedAt: now } : {}),
      ...(evaluation
        ? { score: evaluation.score, passed: evaluation.passed }
        : {}),
    });

    if (outcome.kind === "stale") {
      const concurrentlyRepeated = await this.store.findOwnByTransitionEvent(
        exerciseId,
        operatorId,
        request.eventId,
      );

      if (concurrentlyRepeated) return this.present(concurrentlyRepeated);

      throw new AppConflictException(
        ErrorCodes.DDS_STATUS_TRANSITION_CONFLICT,
        "The DDS card status changed while this command was being processed",
      );
    }

    return this.present(outcome.exercise);
  }

  private async requireOwn(
    exerciseId: string,
    operatorId: string,
  ): Promise<StoredDdsExercise> {
    const exercise = await this.store.loadOwn(exerciseId, operatorId);

    if (exercise === null) {
      // Do not reveal whether the id belongs to another trainee.
      throw new AppNotFoundException(
        ErrorCodes.DDS_EXERCISE_NOT_FOUND,
        "There is no DDS exercise with this id",
      );
    }

    return exercise;
  }

  private present(exercise: StoredDdsExercise): DdsExercise {
    return {
      id: exercise.id,
      scenarioVersionId: exercise.scenarioVersionId,
      trainingAttemptId: exercise.trainingAttemptId,
      addressedService: exercise.addressedService,
      status: exercise.status,
      allowedTransitions: [...allowedDdsTransitions(exercise.status)],
      card: exercise.card,
      acknowledgementDeadlineAt:
        exercise.acknowledgementDeadlineAt.toISOString(),
      acknowledgedAt: exercise.acknowledgedAt?.toISOString() ?? null,
      completedAt: exercise.completedAt?.toISOString() ?? null,
      createdAt: exercise.createdAt.toISOString(),
      updatedAt: exercise.updatedAt.toISOString(),
      events: [...exercise.events],
      result: evaluateDdsExercise({
        status: exercise.status,
        acknowledgementDeadlineAt: exercise.acknowledgementDeadlineAt,
        acknowledgedAt: exercise.acknowledgedAt,
      }),
    };
  }
}
