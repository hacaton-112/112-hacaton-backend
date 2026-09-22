import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callStates,
  ddsExerciseEvents,
  ddsExercises,
  incidentCards,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";

import { ACKNOWLEDGEMENT_NORM_MS } from "../domain/dds-response-status";
import { buildDdsIncidentSnapshot } from "../domain/dds-incident-snapshot";
import type {
  DdsDispatchReceipt,
  DispatchIncidentCardRequest,
} from "../dto/dds-exercise.dto";

const ACTIVE_CALL_STAGES = new Set(["conversation", "wrap_up"]);

/**
 * Converts a live operator card into service-specific incoming deliveries.
 * The incident row is locked so dispatch and every delivery are committed as
 * one operation and a repeated command can only observe the same result.
 */
@Injectable()
export class DdsDispatchService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  dispatch(
    trainingSessionId: string,
    operatorId: string,
    request: DispatchIncidentCardRequest,
  ): Promise<DdsDispatchReceipt> {
    return this.db.transaction(async (tx) => {
      const [call] = await tx
        .select({
          operatorId: callStates.operatorId,
          stage: callStates.stage,
          scenarioVersionId: callStates.scenarioVersionId,
        })
        .from(callStates)
        .where(eq(callStates.trainingSessionId, trainingSessionId))
        .for("update");

      if (!call || call.operatorId !== operatorId) {
        throw new AppNotFoundException(
          ErrorCodes.CALL_NOT_FOUND,
          "There is no call for this training session",
        );
      }

      const existing = await tx
        .select({
          id: ddsExercises.id,
          addressedService: ddsExercises.addressedService,
          acknowledgementDeadlineAt: ddsExercises.acknowledgementDeadlineAt,
          createdAt: ddsExercises.createdAt,
          eventId: ddsExercises.startEventId,
        })
        .from(ddsExercises)
        .where(eq(ddsExercises.sourceTrainingSessionId, trainingSessionId))
        .orderBy(asc(ddsExercises.addressedService));

      if (existing.length > 0) {
        const first = existing[0];
        return {
          trainingSessionId,
          eventId: first.eventId,
          dispatchedAt: first.createdAt.toISOString(),
          deliveries: existing.map((delivery) => ({
            id: delivery.id,
            addressedService: delivery.addressedService,
            acknowledgementDeadlineAt:
              delivery.acknowledgementDeadlineAt.toISOString(),
          })),
        };
      }

      if (!ACTIVE_CALL_STAGES.has(call.stage)) {
        throw new AppForbiddenException(
          ErrorCodes.INCIDENT_CARD_CLOSED,
          "The call is not active and its incident card cannot be dispatched",
        );
      }

      const [source] = await tx
        .select({
          scenarioCode: scenarios.code,
          scenarioTitle: scenarios.title,
          scenarioSummary: scenarios.summary,
          scenarioCategory: scenarios.category,
          callerAnonymous: incidentCards.callerAnonymous,
          callerLastName: incidentCards.callerLastName,
          callerFirstName: incidentCards.callerFirstName,
          callerMiddleName: incidentCards.callerMiddleName,
          callerPhone: incidentCards.callerPhone,
          addressText: incidentCards.addressText,
          latitude: incidentCards.latitude,
          longitude: incidentCards.longitude,
          incidentType: incidentCards.incidentType,
          classifierRouting: incidentCards.classifierRouting,
          description: incidentCards.description,
          victimsTotal: incidentCards.victimsTotal,
          services: incidentCards.services,
          submittedAt: incidentCards.submittedAt,
        })
        .from(incidentCards)
        .innerJoin(
          scenarioVersions,
          eq(scenarioVersions.id, call.scenarioVersionId),
        )
        .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
        .where(eq(incidentCards.trainingSessionId, trainingSessionId))
        .for("update");

      if (!source) {
        throw new AppBadRequestException(
          ErrorCodes.INCIDENT_CARD_NOT_READY,
          "The incident card has not been created yet",
        );
      }
      if (source.submittedAt !== null) {
        throw new AppForbiddenException(
          ErrorCodes.INCIDENT_CARD_CLOSED,
          "The incident card is already closed",
        );
      }

      const built = buildDdsIncidentSnapshot(source);
      if (!built.ok) {
        throw new AppBadRequestException(
          ErrorCodes.INCIDENT_CARD_NOT_READY,
          `The incident card is missing required fields: ${built.missingFields.join(", ")}`,
        );
      }

      const now = new Date();
      const acknowledgementDeadlineAt = new Date(
        now.getTime() + ACKNOWLEDGEMENT_NORM_MS,
      );
      const deliveries = built.services.map((addressedService) => ({
        id: generateId(),
        addressedService,
      }));

      await tx
        .update(incidentCards)
        .set({ submittedAt: now, updatedAt: now })
        .where(eq(incidentCards.trainingSessionId, trainingSessionId));
      await tx.insert(ddsExercises).values(
        deliveries.map((delivery) => ({
          id: delivery.id,
          scenarioVersionId: call.scenarioVersionId,
          // Доставка принадлежит будущему диспетчеру, а не занятию оператора
          // 112: попытка появится, только если карточка пришла назначением.
          // Раньше сюда попадала попытка отправителя — карточка выпадала из
          // очереди смены, а её завершение закрывало чужое занятие. Откуда она
          // пришла, помнит исходная сессия.
          operatorId: null,
          trainingAttemptId: null,
          sourceTrainingSessionId: trainingSessionId,
          addressedService: delivery.addressedService,
          card: built.snapshot,
          acknowledgementDeadlineAt,
          startEventId: request.eventId,
          createdAt: now,
          updatedAt: now,
        })),
      );
      await tx.insert(ddsExerciseEvents).values(
        deliveries.map((delivery) => ({
          id: generateId(),
          exerciseId: delivery.id,
          sequence: 1,
          eventId: request.eventId,
          fromStatus: null,
          toStatus: "pending" as const,
          actorId: operatorId,
          occurredAt: now,
        })),
      );

      return {
        trainingSessionId,
        eventId: request.eventId,
        dispatchedAt: now.toISOString(),
        deliveries: deliveries.map((delivery) => ({
          ...delivery,
          acknowledgementDeadlineAt: acknowledgementDeadlineAt.toISOString(),
        })),
      };
    });
  }
}
