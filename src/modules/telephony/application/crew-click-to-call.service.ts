import { Inject, Injectable } from "@nestjs/common";

import {
  AppBadRequestException,
  AppConflictException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";

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

/** Экранная кнопка звонка: медиа остаётся в SIP-телефоне рабочего места. */
@Injectable()
export class CrewClickToCallService {
  constructor(
    @Inject(TELEPHONY_ENABLED) private readonly enabled: boolean,
    @Inject(TELEPHONY_CONTROL) private readonly control: TelephonyControlPort,
    private readonly directory: DrizzleTelephonyDirectory,
    private readonly exercises: DdsExerciseService,
  ) {}

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
    if (exercise.status !== "accepted" || exercise.completedAt !== null) {
      throw new AppConflictException(
        ErrorCodes.DDS_STATUS_TRANSITION_INVALID,
        "Accept the DDS card before calling a crew",
      );
    }

    const crew = exercise.crewHandoff?.crews.find(
      ({ phoneNumber }) => phoneNumber === input.dialedNumber,
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
    });
    this.assertSameCommand(command, {
      exerciseId,
      operatorId,
      callerExtension: extension,
      dialedNumber: crew.phoneNumber,
    });

    if (command.startedAt === null) {
      try {
        await this.control.originate({
          endpoint: `PJSIP/${extension}`,
          appArgs: [crew.phoneNumber, exerciseId, input.eventId],
          callerId: extension,
          channelId: command.channelId,
          timeoutSeconds: RING_TIMEOUT_SECONDS,
        });
        await this.directory.markCrewCallCommandStarted(
          input.eventId,
          new Date(),
        );
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

  private assertSameCommand(
    command: CrewCallCommandRecord,
    expected: Pick<
      CrewCallCommandRecord,
      "exerciseId" | "operatorId" | "callerExtension" | "dialedNumber"
    >,
  ): void {
    if (
      command.exerciseId !== expected.exerciseId ||
      command.operatorId !== expected.operatorId ||
      command.callerExtension !== expected.callerExtension ||
      command.dialedNumber !== expected.dialedNumber
    ) {
      throw new AppConflictException(
        ErrorCodes.TELEPHONY_CALL_CONFLICT,
        "This event id already belongs to another crew call",
      );
    }
  }
}
