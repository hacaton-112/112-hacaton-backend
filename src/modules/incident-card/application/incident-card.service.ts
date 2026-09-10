import { Inject, Injectable } from "@nestjs/common";

import {
  AppForbiddenException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { IncidentCard, SaveIncidentCard } from "../dto/incident-card.dto";
import {
  INCIDENT_CARD_STORE,
  type IncidentCardStore,
} from "../ports/incident-card.store.port";

/**
 * Карточка происшествия одного учебного звонка.
 *
 * Правила простые и все про честность разбора: карточку ведёт тот, кто ведёт
 * звонок, и правится она только пока звонок идёт. Оценивать то, что дописали
 * после разговора, бессмысленно.
 */
@Injectable()
export class IncidentCardService {
  constructor(
    @Inject(INCIDENT_CARD_STORE)
    private readonly store: IncidentCardStore,
  ) {}

  async get(
    trainingSessionId: string,
    operatorId: string,
  ): Promise<IncidentCard> {
    await this.requireOwnCall(trainingSessionId, operatorId);

    return (
      (await this.store.load(trainingSessionId)) ??
      this.empty(trainingSessionId)
    );
  }

  async save(
    trainingSessionId: string,
    operatorId: string,
    patch: SaveIncidentCard,
  ): Promise<IncidentCard> {
    const call = await this.requireOwnCall(trainingSessionId, operatorId);

    if (call.isOver) {
      throw new AppForbiddenException(
        ErrorCodes.INCIDENT_CARD_CLOSED,
        "The call is over and its incident card is read-only",
      );
    }

    return this.store.save(trainingSessionId, patch);
  }

  /** Вызывается транспортом при завершении звонка. */
  async close(trainingSessionId: string): Promise<void> {
    await this.store.submit(trainingSessionId, new Date());
  }

  private async requireOwnCall(trainingSessionId: string, operatorId: string) {
    const call = await this.store.findCall(trainingSessionId);

    if (call === null) {
      throw new AppNotFoundException(
        ErrorCodes.CALL_NOT_FOUND,
        "There is no call for this training session",
      );
    }

    // Чужой звонок не отличается от несуществующего: знать чужие номера
    // сессий оператору незачем.
    if (call.operatorId !== operatorId) {
      throw new AppNotFoundException(
        ErrorCodes.CALL_NOT_FOUND,
        "There is no call for this training session",
      );
    }

    return call;
  }

  private empty(trainingSessionId: string): IncidentCard {
    return {
      trainingSessionId,
      callerAnonymous: false,
      callerLastName: null,
      callerFirstName: null,
      callerMiddleName: null,
      callerLanguage: null,
      callerPhone: null,
      addressText: null,
      district: null,
      objectType: null,
      entrance: null,
      floor: null,
      intercom: null,
      latitude: null,
      longitude: null,
      nearby: false,
      placeNotes: null,
      incidentType: null,
      categories: [],
      startedAt: null,
      victimsTotal: null,
      victimsChildren: null,
      deathsTotal: null,
      deathsChildren: null,
      description: null,
      services: [],
      victims: [],
      submittedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }
}
