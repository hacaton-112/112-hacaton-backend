import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callStates,
  incidentCards,
  incidentCardVictims,
} from "@/drizzle/schema";

import type {
  IncidentCard,
  IncidentCardVictim,
  SaveIncidentCard,
} from "../dto/incident-card.dto";
import type {
  CallOwnership,
  IncidentCardStore,
} from "../ports/incident-card.store.port";

type CardRow = typeof incidentCards.$inferSelect;
type VictimRow = typeof incidentCardVictims.$inferSelect;

/** Звонок закончился — карточка больше не меняется. */
const FINISHED_STAGES = new Set(["ended", "declined"]);

const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);

@Injectable()
export class DrizzleIncidentCardStore implements IncidentCardStore {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async findCall(trainingSessionId: string): Promise<CallOwnership | null> {
    const [row] = await this.db
      .select({ operatorId: callStates.operatorId, stage: callStates.stage })
      .from(callStates)
      .where(eq(callStates.trainingSessionId, trainingSessionId))
      .limit(1);

    return row
      ? { operatorId: row.operatorId, isOver: FINISHED_STAGES.has(row.stage) }
      : null;
  }

  async load(trainingSessionId: string): Promise<IncidentCard | null> {
    const [card] = await this.db
      .select()
      .from(incidentCards)
      .where(eq(incidentCards.trainingSessionId, trainingSessionId))
      .limit(1);

    if (!card) {
      return null;
    }

    const victims = await this.db
      .select()
      .from(incidentCardVictims)
      .where(eq(incidentCardVictims.trainingSessionId, trainingSessionId))
      .orderBy(asc(incidentCardVictims.orderIndex));

    return this.toCard(card, victims);
  }

  async save(
    trainingSessionId: string,
    patch: SaveIncidentCard,
  ): Promise<IncidentCard> {
    const { victims, startedAt, latitude, longitude, ...fields } = patch;
    const values = {
      ...fields,
      ...(startedAt === undefined
        ? {}
        : { startedAt: startedAt === null ? null : new Date(startedAt) }),
      ...(latitude === undefined
        ? {}
        : { latitude: latitude === null ? null : String(latitude) }),
      ...(longitude === undefined
        ? {}
        : { longitude: longitude === null ? null : String(longitude) }),
      updatedAt: new Date(),
    };

    return this.db.transaction(async (tx) => {
      const [card] = await tx
        .insert(incidentCards)
        .values({ trainingSessionId, ...values })
        .onConflictDoUpdate({
          target: incidentCards.trainingSessionId,
          set: values,
        })
        .returning();

      // Список пострадавших приходит целиком: порядок в окне и есть порядок в
      // списке, а сшивать построчные правки не из чего — у строк нет
      // идентификаторов на стороне клиента.
      if (victims !== undefined) {
        await tx
          .delete(incidentCardVictims)
          .where(eq(incidentCardVictims.trainingSessionId, trainingSessionId));

        if (victims.length > 0) {
          await tx.insert(incidentCardVictims).values(
            victims.map((victim, index) => ({
              id: generateId(),
              trainingSessionId,
              orderIndex: index,
              ...victim,
            })),
          );
        }
      }

      const stored = await tx
        .select()
        .from(incidentCardVictims)
        .where(eq(incidentCardVictims.trainingSessionId, trainingSessionId))
        .orderBy(asc(incidentCardVictims.orderIndex));

      return this.toCard(card, stored);
    });
  }

  async submit(trainingSessionId: string, submittedAt: Date): Promise<void> {
    await this.db
      .update(incidentCards)
      .set({ submittedAt })
      .where(eq(incidentCards.trainingSessionId, trainingSessionId));
  }

  private toCard(card: CardRow, victims: VictimRow[]): IncidentCard {
    return {
      trainingSessionId: card.trainingSessionId,
      callerAnonymous: card.callerAnonymous,
      callerLastName: card.callerLastName,
      callerFirstName: card.callerFirstName,
      callerMiddleName: card.callerMiddleName,
      callerLanguage: card.callerLanguage,
      callerPhone: card.callerPhone,
      addressText: card.addressText,
      district: card.district,
      objectType: card.objectType,
      entrance: card.entrance,
      floor: card.floor,
      intercom: card.intercom,
      latitude: toNumber(card.latitude),
      longitude: toNumber(card.longitude),
      nearby: card.nearby,
      placeNotes: card.placeNotes,
      incidentType: card.incidentType,
      categories: [...card.categories],
      startedAt: card.startedAt?.toISOString() ?? null,
      victimsTotal: card.victimsTotal,
      victimsChildren: card.victimsChildren,
      deathsTotal: card.deathsTotal,
      deathsChildren: card.deathsChildren,
      description: card.description,
      services: [...card.services],
      victims: victims.map((victim): IncidentCardVictim => ({
        lastName: victim.lastName,
        firstName: victim.firstName,
        middleName: victim.middleName,
        reason: victim.reason,
        birthDate: victim.birthDate,
        notes: victim.notes,
      })),
      submittedAt: card.submittedAt?.toISOString() ?? null,
      updatedAt: card.updatedAt.toISOString(),
    };
  }
}
