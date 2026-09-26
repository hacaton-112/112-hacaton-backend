import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, lte, ne } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  type CrewCallOutcome,
  type CrewCallAsrStatus,
  type DispatchService,
  ddsCrewCallCommands,
  ddsCrewCalls,
  rescueCrews,
  telephonyWorkstations,
  users,
} from "@/drizzle/schema";
import type {
  CrewCallPurpose,
  CrewProgressReportStatus,
} from "../domain/crew-call";

export interface RescueCrew {
  readonly id: string;
  readonly service: DispatchService;
  readonly callsign: string;
  readonly phoneNumber: string;
  readonly voiceId: string;
}

export interface TelephonyWorkstation {
  readonly extension: string;
  readonly name: string;
  readonly service: DispatchService;
  readonly userId: string | null;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly isActive: boolean;
}

export interface CrewCallCommandRecord {
  readonly eventId: string;
  readonly exerciseId: string;
  readonly operatorId: string;
  readonly callerExtension: string;
  readonly dialedNumber: string;
  readonly channelId: string;
  readonly purpose: CrewCallPurpose;
  readonly reportedStatus: CrewProgressReportStatus | null;
  readonly startedAt: Date | null;
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
      .where(
        and(
          eq(telephonyWorkstations.extension, extension),
          eq(telephonyWorkstations.isActive, true),
        ),
      )
      .limit(1);

    return workstation?.userId ?? null;
  }

  async findWorkstationExtension(userId: string): Promise<string | null> {
    const [workstation] = await this.db
      .select({ extension: telephonyWorkstations.extension })
      .from(telephonyWorkstations)
      .where(
        and(
          eq(telephonyWorkstations.userId, userId),
          eq(telephonyWorkstations.isActive, true),
        ),
      )
      .limit(1);

    return workstation?.extension ?? null;
  }

  listWorkstations(): Promise<TelephonyWorkstation[]> {
    return this.db
      .select({
        extension: telephonyWorkstations.extension,
        name: telephonyWorkstations.name,
        service: telephonyWorkstations.service,
        userId: telephonyWorkstations.userId,
        fullName: users.fullName,
        email: users.email,
        isActive: telephonyWorkstations.isActive,
      })
      .from(telephonyWorkstations)
      .leftJoin(users, eq(users.id, telephonyWorkstations.userId))
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
        .update(telephonyWorkstations)
        .set({ userId: null })
        .where(eq(telephonyWorkstations.userId, userId));
      await tx
        .insert(telephonyWorkstations)
        .values({
          extension,
          userId,
          name: `Рабочее место ${extension}`,
          service: "dds_01",
          isActive: true,
        })
        .onConflictDoUpdate({
          target: telephonyWorkstations.extension,
          set: { userId, createdAt: new Date() },
        });
    });
  }

  async unbindWorkstation(extension: string): Promise<void> {
    await this.db
      .update(telephonyWorkstations)
      .set({ userId: null })
      .where(eq(telephonyWorkstations.extension, extension));
  }

  async findUserByEmail(email: string) {
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  async saveWorkstation(input: {
    readonly extension: string;
    readonly name: string;
    readonly service: DispatchService;
    readonly userId: string | null;
    readonly isActive: boolean;
  }): Promise<"created" | "updated"> {
    const [existing] = await this.db
      .select({ extension: telephonyWorkstations.extension })
      .from(telephonyWorkstations)
      .where(eq(telephonyWorkstations.extension, input.extension))
      .limit(1);

    await this.db.transaction(async (tx) => {
      if (input.userId) {
        // Один пользователь не может одновременно отвечать с двух аппаратов.
        await tx
          .update(telephonyWorkstations)
          .set({ userId: null })
          .where(
            and(
              eq(telephonyWorkstations.userId, input.userId),
              ne(telephonyWorkstations.extension, input.extension),
            ),
          );
      }
      await tx
        .insert(telephonyWorkstations)
        .values(input)
        .onConflictDoUpdate({
          target: telephonyWorkstations.extension,
          set: {
            name: input.name,
            service: input.service,
            userId: input.userId,
            isActive: input.isActive,
          },
        });
    });
    return existing ? "updated" : "created";
  }

  async reserveCrewCallCommand(input: {
    readonly eventId: string;
    readonly exerciseId: string;
    readonly operatorId: string;
    readonly callerExtension: string;
    readonly dialedNumber: string;
    readonly channelId: string;
    readonly purpose: CrewCallPurpose;
    readonly reportedStatus: CrewProgressReportStatus | null;
  }): Promise<CrewCallCommandRecord> {
    const [created] = await this.db
      .insert(ddsCrewCallCommands)
      .values(input)
      .onConflictDoNothing({ target: ddsCrewCallCommands.eventId })
      .returning();
    if (created) return created;

    const [existing] = await this.db
      .select()
      .from(ddsCrewCallCommands)
      .where(eq(ddsCrewCallCommands.eventId, input.eventId))
      .limit(1);
    // Конфликт уже обработан БД, поэтому отсутствие строки возможно только при
    // внешнем удалении между INSERT и SELECT. Повтор INSERT восстановит её.
    if (!existing) return this.reserveCrewCallCommand(input);
    return existing;
  }

  async markCrewCallCommandStarted(eventId: string, startedAt: Date) {
    await this.db
      .update(ddsCrewCallCommands)
      .set({ startedAt })
      .where(eq(ddsCrewCallCommands.eventId, eventId));
  }

  async listUnansweredCrewCallCommandsBefore(
    cutoff: Date,
  ): Promise<CrewCallCommandRecord[]> {
    return this.db
      .select({
        eventId: ddsCrewCallCommands.eventId,
        exerciseId: ddsCrewCallCommands.exerciseId,
        operatorId: ddsCrewCallCommands.operatorId,
        callerExtension: ddsCrewCallCommands.callerExtension,
        dialedNumber: ddsCrewCallCommands.dialedNumber,
        channelId: ddsCrewCallCommands.channelId,
        purpose: ddsCrewCallCommands.purpose,
        reportedStatus: ddsCrewCallCommands.reportedStatus,
        startedAt: ddsCrewCallCommands.startedAt,
      })
      .from(ddsCrewCallCommands)
      .leftJoin(
        ddsCrewCalls,
        eq(ddsCrewCalls.channelId, ddsCrewCallCommands.channelId),
      )
      .where(
        and(
          lte(ddsCrewCallCommands.startedAt, cutoff),
          isNull(ddsCrewCalls.id),
        ),
      );
  }

  /**
   * Если аппарат не ответил, канал не входит в Stasis и обычный журнал звонка
   * не создаётся. Фиксируем такую попытку после таймаута; если оператор всё же
   * ответил, уникальный channelId уже занят и вставка ничего не меняет.
   */
  async recordUnansweredCrewCall(call: {
    readonly id: string;
    readonly exerciseId: string;
    readonly crewId: string | null;
    readonly callerUserId: string;
    readonly callerExtension: string;
    readonly dialedNumber: string;
    readonly channelId: string;
    readonly purpose: CrewCallPurpose;
    readonly reportedStatus: CrewProgressReportStatus | null;
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly correct: boolean;
  }): Promise<void> {
    await this.db
      .insert(ddsCrewCalls)
      .values({
        ...call,
        outcome: "abandoned",
        acknowledgements: 0,
        transcript: "",
        validation: null,
        asrStatus: "not_started",
        reportText: null,
      })
      .onConflictDoNothing({ target: ddsCrewCalls.channelId });
  }

  async startCall(call: {
    readonly id: string;
    readonly exerciseId: string | null;
    readonly crewId: string | null;
    readonly callerUserId: string | null;
    readonly callerExtension: string;
    readonly dialedNumber: string;
    readonly channelId: string;
    readonly purpose: CrewCallPurpose;
    readonly reportedStatus: CrewProgressReportStatus | null;
    readonly reportText: string | null;
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
      readonly transcript: string;
      readonly validation: {
        readonly complete: boolean;
        readonly coveredFields: readonly string[];
        readonly missingFields: readonly string[];
      } | null;
      readonly asrStatus: CrewCallAsrStatus;
    },
  ): Promise<void> {
    await this.db
      .update(ddsCrewCalls)
      .set(result)
      .where(eq(ddsCrewCalls.channelId, channelId));
  }
}
