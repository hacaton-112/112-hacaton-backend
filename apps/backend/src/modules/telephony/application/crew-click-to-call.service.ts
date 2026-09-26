import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import {
  AppBadRequestException,
  AppConflictException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { generateId } from "@/common/utils/id";
import {
  crewCallPlan,
  DdsExerciseService,
} from "@/modules/dds-exercise/application/dds-exercise.service";

import type { CrewCallCommand } from "../dto/telephony.dto";
import {
  DrizzleTelephonyDirectory,
  type CrewCallCommandRecord,
} from "../infrastructure/drizzle-telephony.directory";
import {
  TELEPHONY_CONTROL,
  type TelephonyControlPort,
} from "../ports/telephony-control.port";
import { TELEPHONY_ENABLED } from "./crew-handoff.service";

const RING_TIMEOUT_SECONDS = 30;
const UNANSWERED_CALL_GRACE_MS = 2_000;
const RECONCILE_INTERVAL_MS = 30_000;

/** Экранная кнопка звонка: медиа остаётся в SIP-телефоне рабочего места. */
@Injectable()
export class CrewClickToCallService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrewClickToCallService.name);
  private readonly unansweredTimers = new Set<ReturnType<typeof setTimeout>>();
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(TELEPHONY_ENABLED) private readonly enabled: boolean,
    @Inject(TELEPHONY_CONTROL) private readonly control: TelephonyControlPort,
    private readonly directory: DrizzleTelephonyDirectory,
    private readonly exercises: DdsExerciseService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) return;

    void this.reconcileUnansweredCommands();
    this.reconcileTimer = setInterval(
      () => void this.reconcileUnansweredCommands(),
      RECONCILE_INTERVAL_MS,
    );
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.reconcileTimer);
    for (const timer of this.unansweredTimers) clearTimeout(timer);
    this.unansweredTimers.clear();
  }

  async start(
    operatorId: string,
    exerciseId: string,
    input: { readonly eventId: string; readonly dialedNumber: string },
  ): Promise<CrewCallCommand> {
    if (!this.enabled) {
      throw new AppServiceUnavailableException(
        ErrorCodes.TELEPHONY_DISABLED,
        "Training telephony is disabled",
      );
    }

    const exercise = await this.exercises.get(exerciseId, operatorId);
    const handoff = exercise.crewHandoff;
    const plan = handoff ? crewCallPlan(exercise.status, handoff) : null;
    if (!handoff || !plan || exercise.completedAt !== null) {
      throw new AppConflictException(
        ErrorCodes.DDS_STATUS_TRANSITION_INVALID,
        "There is no crew call required for the current DDS status",
      );
    }

    const crew = handoff.crews.find(
      ({ phoneNumber }) =>
        phoneNumber === input.dialedNumber &&
        plan.allowedCrewPhoneNumbers.includes(phoneNumber),
    );
    if (!crew) {
      throw new AppBadRequestException(
        ErrorCodes.TELEPHONY_CREW_UNAVAILABLE,
        "The number is not available for this DDS card",
      );
    }

    const extension = await this.directory.findWorkstationExtension(operatorId);
    if (!extension) {
      throw new AppConflictException(
        ErrorCodes.TELEPHONY_WORKSTATION_REQUIRED,
        "Bind a SIP workstation to the operator before calling a crew",
      );
    }

    const command = await this.directory.reserveCrewCallCommand({
      eventId: input.eventId,
      exerciseId,
      operatorId,
      callerExtension: extension,
      dialedNumber: crew.phoneNumber,
      channelId: input.eventId,
      purpose: plan.purpose,
      reportedStatus: plan.reportedStatus,
    });
    this.assertSameCommand(command, {
      exerciseId,
      operatorId,
      callerExtension: extension,
      dialedNumber: crew.phoneNumber,
      purpose: plan.purpose,
      reportedStatus: plan.reportedStatus,
    });

    if (command.startedAt === null) {
      try {
        await this.control.originate({
          endpoint: `PJSIP/${extension}`,
          appArgs: [
            crew.phoneNumber,
            exerciseId,
            input.eventId,
            plan.purpose,
            plan.reportedStatus ?? "",
          ],
          callerId: extension,
          channelId: command.channelId,
          timeoutSeconds: RING_TIMEOUT_SECONDS,
        });
        const startedAt = new Date();
        await this.directory.markCrewCallCommandStarted(
          input.eventId,
          startedAt,
        );
        this.scheduleUnansweredCall({ ...command, startedAt });
      } catch {
        throw new AppServiceUnavailableException(
          ErrorCodes.TELEPHONY_UNAVAILABLE,
          "Asterisk could not start the workstation call",
        );
      }
    }

    return {
      eventId: input.eventId,
      exerciseId,
      dialedNumber: crew.phoneNumber,
      workstationExtension: extension,
      state: "ringing",
    };
  }

  private scheduleUnansweredCall(command: CrewCallCommandRecord): void {
    const timer = setTimeout(
      () => {
        this.unansweredTimers.delete(timer);
        void this.recordUnansweredCall(command);
      },
      RING_TIMEOUT_SECONDS * 1_000 + UNANSWERED_CALL_GRACE_MS,
    );
    timer.unref?.();
    this.unansweredTimers.add(timer);
  }

  private async reconcileUnansweredCommands(): Promise<void> {
    const cutoff = new Date(
      Date.now() - RING_TIMEOUT_SECONDS * 1_000 - UNANSWERED_CALL_GRACE_MS,
    );

    try {
      const commands =
        await this.directory.listUnansweredCrewCallCommandsBefore(cutoff);
      await Promise.all(
        commands.map((command) => this.recordUnansweredCall(command)),
      );
    } catch (error) {
      this.logger.warn(
        `Could not reconcile unanswered DDS calls: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async recordUnansweredCall(
    command: CrewCallCommandRecord,
  ): Promise<void> {
    if (!command.startedAt) return;

    try {
      const crew = await this.directory.findCrewByNumber(command.dialedNumber);
      await this.directory.recordUnansweredCrewCall({
        id: generateId(),
        exerciseId: command.exerciseId,
        crewId: crew?.id ?? null,
        callerUserId: command.operatorId,
        callerExtension: command.callerExtension,
        dialedNumber: command.dialedNumber,
        channelId: command.channelId,
        purpose: command.purpose,
        reportedStatus: command.reportedStatus,
        startedAt: command.startedAt,
        endedAt: new Date(),
        correct: crew !== null,
      });
    } catch (error) {
      this.logger.warn(
        `Could not record unanswered DDS call ${command.channelId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private assertSameCommand(
    command: CrewCallCommandRecord,
    expected: Pick<
      CrewCallCommandRecord,
      | "exerciseId"
      | "operatorId"
      | "callerExtension"
      | "dialedNumber"
      | "purpose"
      | "reportedStatus"
    >,
  ): void {
    if (
      command.exerciseId !== expected.exerciseId ||
      command.operatorId !== expected.operatorId ||
      command.callerExtension !== expected.callerExtension ||
      command.dialedNumber !== expected.dialedNumber ||
      command.purpose !== expected.purpose ||
      command.reportedStatus !== expected.reportedStatus
    ) {
      throw new AppConflictException(
        ErrorCodes.TELEPHONY_CALL_CONFLICT,
        "This event id already belongs to another crew call",
      );
    }
  }
}
