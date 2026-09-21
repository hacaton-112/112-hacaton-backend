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
  ACKNOWLEDGEMENT_NORM_MS,
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
  type StoredCrewHandoff,
  type StoredDdsExercise,
} from "../ports/dds-exercise.store.port";

/**
 * Передача карточки наряду по телефону — обязательный шаг.
 *
 * Включается вместе с учебной IP-телефонией: без АТС звонить некуда, и ДДС
 * работает как раньше.
 */
export const DDS_CREW_HANDOFF_REQUIRED = Symbol("DDS_CREW_HANDOFF_REQUIRED");

/** Первый принятый нарядом звонок в нужную службу и ошибки набора до него. */
const handoffFacts = (handoff: StoredCrewHandoff) => {
  const index = handoff.calls.findIndex(
    (call) => call.outcome === "completed" && call.correct === true,
  );
  const before = index === -1 ? handoff.calls : handoff.calls.slice(0, index);

  return {
    completedCallStartedAt:
      index === -1 ? null : handoff.calls[index]!.startedAt,
    wrongCallsBefore: before.filter((call) => call.correct === false).length,
  };
};

@Injectable()
export class DdsExerciseService {
  constructor(
    @Inject(DDS_EXERCISE_STORE)
    private readonly store: DdsExerciseStore,
    @Inject(DDS_CREW_HANDOFF_REQUIRED)
    private readonly handoffRequired: boolean,
  ) {}

  /** Доставка, к которой относится звонок диспетчера наряду. */
  findAwaitingHandoff(operatorId: string) {
    return this.store.findAwaitingHandoff(operatorId);
  }

  async start(
    operatorId: string,
    request: StartDdsExerciseRequest,
  ): Promise<DdsExercise> {
    const repeated = await this.store.findStartedByEvent(
      operatorId,
      request.eventId,
    );

    if (repeated) return this.presentOne(repeated);

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

    return this.presentOne(exercise);
  }

  async list(operatorId: string): Promise<readonly DdsExercise[]> {
    return this.presentAll(await this.store.listByOperator(operatorId));
  }

  async get(exerciseId: string, operatorId: string): Promise<DdsExercise> {
    return this.presentOne(await this.requireOwn(exerciseId, operatorId));
  }

  /**
   * Пакетная выдача для кабинета преподавателя.
   *
   * Доступ к попыткам проверяет вызывающий: здесь нет условия смены оператора,
   * зато и запрос на каждую карточку не уходит.
   */
  async presentByIds(
    exerciseIds: readonly string[],
  ): Promise<Map<string, DdsExercise>> {
    const presented = await this.presentAll(
      await this.store.listByIds(exerciseIds),
    );

    return new Map(presented.map((exercise) => [exercise.id, exercise]));
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

    if (repeated) return this.presentOne(repeated);

    const exercise = await this.requireOwn(exerciseId, operatorId);
    if (exercise.completedAt !== null) {
      throw new AppConflictException(ErrorCodes.DDS_STATUS_TRANSITION_INVALID, "This DDS attempt is closed");
    }
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

    const handoff = this.handoffRequired && !exercise.trainingAttemptId
      ? ((await this.store.loadCrewHandoffs([exercise])).get(exercise.id) ??
        null)
      : null;

    // Наряд выезжает по звонку диспетчера: без переданной карточки
    // «реагирование» было бы отметкой о том, чего не произошло.
    if (
      handoff !== null &&
      request.status === "responding" &&
      handoffFacts(handoff).completedCallStartedAt === null
    ) {
      throw new AppConflictException(
        ErrorCodes.DDS_CREW_NOT_NOTIFIED,
        "Hand the card over to a crew by phone before responding",
      );
    }

    const now = new Date();
    const acknowledgedAt =
      exercise.status === "pending" ? now : exercise.acknowledgedAt;
    const evaluation = evaluateDdsExercise({
      status: request.status,
      acknowledgementDeadlineAt: exercise.acknowledgementDeadlineAt,
      acknowledgedAt,
      passThreshold: exercise.passThreshold,
      ...(handoff ? { handoff: handoffFacts(handoff) } : {}),
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

      if (concurrentlyRepeated) return this.presentOne(concurrentlyRepeated);

      throw new AppConflictException(
        ErrorCodes.DDS_STATUS_TRANSITION_CONFLICT,
        "The DDS card status changed while this command was being processed",
      );
    }

    return this.presentOne(outcome.exercise);
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

  private async presentOne(exercise: StoredDdsExercise): Promise<DdsExercise> {
    const [presented] = await this.presentAll([exercise]);
    return presented!;
  }

  private async presentAll(
    exercises: readonly StoredDdsExercise[],
  ): Promise<DdsExercise[]> {
    const handoffs = this.handoffRequired
      ? await this.store.loadCrewHandoffs(exercises.filter((item) => !item.trainingAttemptId))
      : new Map<string, StoredCrewHandoff>();

    return exercises.map((exercise) =>
      this.present(exercise, handoffs.get(exercise.id) ?? null),
    );
  }

  private present(
    exercise: StoredDdsExercise,
    handoff: StoredCrewHandoff | null,
  ): DdsExercise {
    const facts = handoff ? handoffFacts(handoff) : null;

    return {
      id: exercise.id,
      scenarioVersionId: exercise.scenarioVersionId,
      trainingAttemptId: exercise.trainingAttemptId,
      sourceTrainingSessionId: exercise.sourceTrainingSessionId,
      addressedService: exercise.addressedService,
      status: exercise.status,
      allowedTransitions: exercise.completedAt ? [] : [...allowedDdsTransitions(exercise.status)],
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
        passThreshold: exercise.passThreshold,
        ...(facts ? { handoff: facts } : {}),
      }),
      crewHandoff:
        handoff && facts
          ? {
              notified: facts.completedCallStartedAt !== null,
              crews: handoff.crews.map((crew) => ({ ...crew })),
              calls: handoff.calls.map((call) => ({
                dialedNumber: call.dialedNumber,
                callsign: call.callsign,
                startedAt: call.startedAt.toISOString(),
                endedAt: call.endedAt?.toISOString() ?? null,
                outcome: call.outcome,
                correct: call.correct,
                acknowledgements: call.acknowledgements,
              })),
            }
          : null,
    };
  }
}
