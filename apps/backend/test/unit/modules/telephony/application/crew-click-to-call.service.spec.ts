import type { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";

import type { DrizzleTelephonyDirectory } from "@/modules/telephony/infrastructure/drizzle-telephony.directory";
import type { TelephonyControlPort } from "@/modules/telephony/ports/telephony-control.port";
import { CrewClickToCallService } from "@/modules/telephony/application/crew-click-to-call.service";

const EVENT_ID = "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7";
const EXERCISE_ID = "68e4085a-a84f-435e-804f-8a242db80385";

const setup = (overrides?: {
  enabled?: boolean;
  status?: "pending" | "accepted" | "responding";
  extension?: string | null;
  startedAt?: Date | null;
  progress?: boolean;
}) => {
  const purpose = overrides?.progress ? "progress_check" : "handoff";
  const reportedStatus = overrides?.progress ? "arrived" : null;
  const control = {
    originate: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<TelephonyControlPort>;
  const directory = {
    findWorkstationExtension: jest.fn(async () =>
      overrides?.extension === undefined ? "201" : overrides.extension,
    ),
    reserveCrewCallCommand: jest.fn(async () => ({
      eventId: EVENT_ID,
      exerciseId: EXERCISE_ID,
      operatorId: "operator-1",
      callerExtension: "201",
      dialedNumber: "1012",
      channelId: EVENT_ID,
      purpose,
      reportedStatus,
      startedAt: overrides?.startedAt ?? null,
    })),
    markCrewCallCommandStarted: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<DrizzleTelephonyDirectory>;
  const exercises = {
    get: jest.fn(async () => ({
      id: EXERCISE_ID,
      status: overrides?.status ?? "accepted",
      completedAt: null,
      crewHandoff: {
        crews: [{ callsign: "ПСЧ-12", phoneNumber: "1012" }],
        calls: overrides?.progress
          ? [
              {
                dialedNumber: "1012",
                callsign: "ПСЧ-12",
                purpose: "handoff",
                reportedStatus: null,
                reportText: null,
                outcome: "completed",
                correct: true,
              },
            ]
          : [],
        notified: overrides?.progress ?? false,
        callMode: purpose,
        nextReportStatus: reportedStatus,
        selectedCrewPhoneNumber: overrides?.progress ? "1012" : null,
      },
    })),
  } as unknown as jest.Mocked<DdsExerciseService>;
  const service = new CrewClickToCallService(
    overrides?.enabled ?? true,
    control,
    directory,
    exercises,
  );
  return { service, control, directory, exercises };
};

describe(CrewClickToCallService.name, () => {
  it("rings the bound workstation and passes the exact card to Stasis", async () => {
    const { service, control, directory } = setup();

    await expect(
      service.start("operator-1", EXERCISE_ID, {
        eventId: EVENT_ID,
        dialedNumber: "1012",
      }),
    ).resolves.toMatchObject({
      eventId: EVENT_ID,
      exerciseId: EXERCISE_ID,
      workstationExtension: "201",
      state: "ringing",
    });
    expect(control.originate).toHaveBeenCalledWith({
      endpoint: "PJSIP/201",
      appArgs: ["1012", EXERCISE_ID, EVENT_ID, "handoff", ""],
      callerId: "201",
      channelId: EVENT_ID,
      timeoutSeconds: 30,
    });
    expect(directory.markCrewCallCommandStarted).toHaveBeenCalledWith(
      EVENT_ID,
      expect.any(Date),
    );
  });

  it("does not originate a second channel for a completed command", async () => {
    const { service, control } = setup({ startedAt: new Date() });

    await service.start("operator-1", EXERCISE_ID, {
      eventId: EVENT_ID,
      dialedNumber: "1012",
    });

    expect(control.originate).not.toHaveBeenCalled();
  });

  it("starts a control call only to the crew that accepted the card", async () => {
    const { service, control } = setup({
      status: "responding",
      progress: true,
    });

    await service.start("operator-1", EXERCISE_ID, {
      eventId: EVENT_ID,
      dialedNumber: "1012",
    });

    expect(control.originate).toHaveBeenCalledWith(
      expect.objectContaining({
        appArgs: ["1012", EXERCISE_ID, EVENT_ID, "progress_check", "arrived"],
      }),
    );
  });

  it("rejects a number that is not offered by the active card", async () => {
    const { service } = setup();

    await expect(
      service.start("operator-1", EXERCISE_ID, {
        eventId: EVENT_ID,
        dialedNumber: "9999",
      }),
    ).rejects.toMatchObject({ code: "TELEPHONY_CREW_UNAVAILABLE" });
  });

  it("requires an accepted card and a bound workstation", async () => {
    await expect(
      setup({ status: "pending" }).service.start("operator-1", EXERCISE_ID, {
        eventId: EVENT_ID,
        dialedNumber: "1012",
      }),
    ).rejects.toMatchObject({ code: "DDS_STATUS_TRANSITION_INVALID" });
    await expect(
      setup({ extension: null }).service.start("operator-1", EXERCISE_ID, {
        eventId: EVENT_ID,
        dialedNumber: "1012",
      }),
    ).rejects.toMatchObject({ code: "TELEPHONY_WORKSTATION_REQUIRED" });
  });

  it("fails safely while training telephony is disabled", async () => {
    const { service, exercises } = setup({ enabled: false });

    await expect(
      service.start("operator-1", EXERCISE_ID, {
        eventId: EVENT_ID,
        dialedNumber: "1012",
      }),
    ).rejects.toMatchObject({ code: "TELEPHONY_DISABLED" });
    expect(exercises.get).not.toHaveBeenCalled();
  });
});
