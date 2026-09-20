import { CREW_SCRIPT_TIMING } from "../domain/crew-handoff-script";
import type { RescueCrew } from "../infrastructure/drizzle-telephony.directory";
import type {
  TelephonyControlPort,
  TelephonyEvent,
} from "../ports/telephony-control.port";
import {
  type CrewHandoffDirectory,
  CrewHandoffService,
  UNKNOWN_NUMBER_LINE,
} from "./crew-handoff.service";

const FIRE_CREW: RescueCrew = {
  id: "crew-fire",
  service: "dds_01",
  callsign: "Пожарная часть 12",
  phoneNumber: "1012",
  voiceId: "ryan",
};
const AMBULANCE_CREW: RescueCrew = {
  id: "crew-ambulance",
  service: "dds_03",
  callsign: "Скорая 35",
  phoneNumber: "1035",
  voiceId: "eric",
};

/** Учебная АТС без сети: запоминает команды и отдаёт события по кнопке. */
class FakePbx implements TelephonyControlPort {
  listener?: (event: TelephonyEvent) => void;
  readonly played: string[] = [];
  readonly hungUp: string[] = [];
  private playback = 0;

  start = jest.fn();
  stop = jest.fn();
  subscribe(listener: (event: TelephonyEvent) => void) {
    this.listener = listener;
    return () => undefined;
  }
  answer = jest.fn(async () => undefined);
  detectSpeech = jest.fn(async () => undefined);
  async play(_channelId: string, media: string) {
    this.played.push(media);
    this.playback += 1;
    return `playback-${this.playback}`;
  }
  async hangUp(channelId: string) {
    this.hungUp.push(channelId);
  }

  emit(event: TelephonyEvent) {
    this.listener!(event);
  }
  lastPlayback() {
    return `playback-${this.playback}`;
  }
}

const settle = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

const setup = (
  awaiting: { id: string; addressedService: "dds_01" | "dds_03" } | null = {
    id: "exercise-1",
    addressedService: "dds_01",
  },
) => {
  const pbx = new FakePbx();
  const directory: jest.Mocked<CrewHandoffDirectory> = {
    findCrewByNumber: jest.fn(
      async (number: string) =>
        [FIRE_CREW, AMBULANCE_CREW].find(
          (crew) => crew.phoneNumber === number,
        ) ?? null,
    ),
    findWorkstationUser: jest.fn(async (extension: string) =>
      extension === "201" ? "user-1" : null,
    ),
    listCrews: jest.fn(async () => [FIRE_CREW]),
    startCall: jest.fn<
      Promise<void>,
      Parameters<CrewHandoffDirectory["startCall"]>
    >(async () => undefined),
    finishCall: jest.fn<
      Promise<void>,
      Parameters<CrewHandoffDirectory["finishCall"]>
    >(async () => undefined),
  };
  const prompts = {
    ensure: jest.fn(async (text: string) => `sound:crew/${text}`),
    prepareAll: jest.fn(async () => undefined),
  };
  const service = new CrewHandoffService(
    true,
    pbx,
    directory,
    prompts,
    jest.fn(async () => awaiting),
  );
  service.onModuleInit();

  const call = async (dialed: string) => {
    pbx.emit({
      type: "call-started",
      channelId: "c-1",
      callerNumber: "201",
      dialedNumber: dialed,
    });
    await settle();
  };
  const finishPrompt = async () => {
    pbx.emit({
      type: "playback-finished",
      channelId: "c-1",
      playbackId: pbx.lastPlayback(),
    });
    await settle();
  };
  const say = async (durationMs = 2_000) => {
    pbx.emit({ type: "speech-started", channelId: "c-1" });
    pbx.emit({ type: "speech-finished", channelId: "c-1", durationMs });
    await settle();
  };

  return { service, pbx, directory, prompts, call, finishPrompt, say };
};

describe(CrewHandoffService.name, () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("stays off the line while telephony is disabled", () => {
    const pbx = new FakePbx();
    new CrewHandoffService(
      false,
      pbx,
      {} as CrewHandoffDirectory,
      {} as never,
      jest.fn(),
    ).onModuleInit();

    expect(pbx.start).not.toHaveBeenCalled();
  });

  it("prepares every crew line before the first call", async () => {
    const { prompts } = setup();
    await settle();

    expect(prompts.prepareAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        { text: "Пожарная часть 12, слушаю.", voiceId: "ryan" },
        { text: "Принято, выезжаем.", voiceId: "ryan" },
      ]),
    );
  });

  it("takes the report of the right crew and records it for the card", async () => {
    jest.useFakeTimers();
    const { pbx, directory, call, finishPrompt, say } = setup();

    await call("1012");
    expect(pbx.answer).toHaveBeenCalledWith("c-1");
    expect(pbx.detectSpeech).toHaveBeenCalledWith("c-1");
    expect(directory.startCall).toHaveBeenCalledWith(
      expect.objectContaining({
        exerciseId: "exercise-1",
        crewId: "crew-fire",
        callerUserId: "user-1",
        correct: true,
      }),
    );

    await finishPrompt();
    await say();
    await finishPrompt();
    jest.advanceTimersByTime(CREW_SCRIPT_TIMING.closingSilenceMs);
    await settle();
    await finishPrompt();

    expect(pbx.played).toEqual([
      "sound:crew/Пожарная часть 12, слушаю.",
      "sound:crew/Записываю.",
      "sound:crew/Принято, выезжаем.",
    ]);
    expect(pbx.hungUp).toEqual(["c-1"]);
    expect(directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ outcome: "completed", acknowledgements: 1 }),
    );
  });

  it("marks a call to another service as a wrong number", async () => {
    const { directory, call } = setup();

    await call("1035");

    expect(directory.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ crewId: "crew-ambulance", correct: false }),
    );
  });

  it("answers an unknown number with the PBX line and hangs up", async () => {
    const { pbx, directory, call, finishPrompt } = setup();

    await call("1999");
    expect(pbx.played).toEqual([`sound:crew/${UNKNOWN_NUMBER_LINE}`]);
    expect(pbx.detectSpeech).not.toHaveBeenCalled();

    await finishPrompt();
    expect(pbx.hungUp).toEqual(["c-1"]);

    pbx.emit({ type: "call-ended", channelId: "c-1" });
    await settle();
    expect(directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ outcome: "unknown_number" }),
    );
  });

  it("keeps a call without an accepted card neither right nor wrong", async () => {
    const { directory, call } = setup(null);

    await call("1012");

    expect(directory.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: null, correct: null }),
    );
  });

  it("reacts only to the end of the latest line", async () => {
    const { pbx, call, finishPrompt } = setup();
    await call("1012");

    // Устаревшее окончание не должно продвигать разговор.
    pbx.emit({
      type: "playback-finished",
      channelId: "c-1",
      playbackId: "old",
    });
    await settle();
    expect(pbx.played).toHaveLength(1);

    await finishPrompt();
    expect(pbx.played).toHaveLength(1);
  });

  it("hangs up and keeps the call when a line cannot be played", async () => {
    const { pbx, directory, prompts, call } = setup();
    prompts.ensure.mockRejectedValueOnce(new Error("TTS is down"));

    await call("1012");

    expect(pbx.hungUp).toEqual(["c-1"]);
    expect(directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ outcome: "abandoned" }),
    );
  });
});
