import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  type CrewCallOutcome,
  type DispatchService,
  ddsCrewCalls,
  rescueCrews,
  telephonyWorkstations,
  users,
} from "@/drizzle/schema";

export interface RescueCrew {
  readonly id: string;
  readonly service: DispatchService;
  readonly callsign: string;
  readonly phoneNumber: string;
  readonly voiceId: string;
}

export interface TelephonyWorkstation {
  readonly extension: string;
  readonly userId: string;
  readonly fullName: string;
}

/**
 * Справочники учебной АТС и журнал звонков нарядам.
 *
 * Звонок пишется дважды: при соединении — чтобы он был виден, даже если
 * backend упадёт посреди разговора, и при отбое — с исходом.
 */
@Injectable()
export class DrizzleTelephonyDirectory {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async findCrewByNumber(phoneNumber: string): Promise<RescueCrew | null> {
    const [crew] = await this.db
      .select()
      .from(rescueCrews)
      .where(eq(rescueCrews.phoneNumber, phoneNumber))
      .limit(1);

    return crew ?? null;
  }

  listCrews(): Promise<RescueCrew[]> {
    return this.db
      .select({
        id: rescueCrews.id,
        service: rescueCrews.service,
        callsign: rescueCrews.callsign,
        phoneNumber: rescueCrews.phoneNumber,
        voiceId: rescueCrews.voiceId,
      })
      .from(rescueCrews)
      .orderBy(asc(rescueCrews.service), asc(rescueCrews.callsign));
  }

  async findWorkstationUser(extension: string): Promise<string | null> {
    const [workstation] = await this.db
      .select({ userId: telephonyWorkstations.userId })
      .from(telephonyWorkstations)
      .where(eq(telephonyWorkstations.extension, extension))
      .limit(1);

    return workstation?.userId ?? null;
  }

  listWorkstations(): Promise<TelephonyWorkstation[]> {
    return this.db
      .select({
        extension: telephonyWorkstations.extension,
        userId: telephonyWorkstations.userId,
        fullName: users.fullName,
      })
      .from(telephonyWorkstations)
      .innerJoin(users, eq(users.id, telephonyWorkstations.userId))
      .orderBy(asc(telephonyWorkstations.extension));
  }

  /**
   * Сажает человека за телефон рабочего места.
   *
   * У человека одно рабочее место: пересаживая его, прежнее освобождаем, иначе
   * звонок с чужого телефона приписался бы ему.
   */
  async bindWorkstation(extension: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(telephonyWorkstations)
        .where(eq(telephonyWorkstations.userId, userId));
      await tx
        .insert(telephonyWorkstations)
        .values({ extension, userId })
        .onConflictDoUpdate({
          target: telephonyWorkstations.extension,
          set: { userId, createdAt: new Date() },
        });
    });
  }

  async unbindWorkstation(extension: string): Promise<void> {
    await this.db
      .delete(telephonyWorkstations)
      .where(eq(telephonyWorkstations.extension, extension));
  }

  async startCall(call: {
    readonly id: string;
    readonly exerciseId: string | null;
    readonly crewId: string | null;
    readonly callerUserId: string | null;
    readonly callerExtension: string;
    readonly dialedNumber: string;
    readonly channelId: string;
    readonly startedAt: Date;
    readonly correct: boolean | null;
  }): Promise<void> {
    await this.db.insert(ddsCrewCalls).values(call).onConflictDoNothing();
  }

  async finishCall(
    channelId: string,
    result: {
      readonly endedAt: Date;
      readonly outcome: CrewCallOutcome;
      readonly acknowledgements: number;
    },
  ): Promise<void> {
    await this.db
      .update(ddsCrewCalls)
      .set(result)
      .where(eq(ddsCrewCalls.channelId, channelId));
  }
}
