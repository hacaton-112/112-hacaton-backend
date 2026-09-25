import type {
  AsrStreamer,
  AsrStreamHandle,
  AsrTranscript,
} from "@/modules/asr/ports/asr-stream.port";
import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";

import type { RescueCrew } from "@/modules/telephony/infrastructure/drizzle-telephony.directory";
import type {
  TelephonyControlPort,
  TelephonyEvent,
} from "@/modules/telephony/ports/telephony-control.port";
import {
  type CrewHandoffDirectory,
  CrewHandoffService,
  UNKNOWN_NUMBER_LINE,
} from "@/modules/telephony/application/crew-handoff.service";

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
const CARD: DdsCardSnapshot = {
  scenarioCode: "fire-1",
  title: "Пожар в квартире",
  summary: "В квартире горит кухня.",
  category: "fire",
  addressText: "Москва, улица Учебная, дом 12",
  latitude: 55.7,
  longitude: 37.6,
  callerName: null,
  callerPhone: null,
  incidentType: "Пожар",
  description: "На кухне открытое пламя и сильный дым",
  victimsTotal: 1,
  services: ["dds_01"],
};

class FakePbx implements TelephonyControlPort {
  listener?: (event: TelephonyEvent) => void;
  audio?: (chunk: Uint8Array) => void;
  readonly played: string[] = [];
  readonly hungUp: string[] = [];
  readonly tapStop = jest.fn(async () => undefined);
  private playback = 0;

  start = jest.fn();
  stop = jest.fn();
  subscribe(listener: (event: TelephonyEvent) => void) {
    this.listener = listener;
    return () => undefined;
  }
  originate = jest.fn(async () => undefined);
  answer = jest.fn(async () => undefined);
  captureInboundAudio = jest.fn(
    async (_channelId: string, onAudio: (chunk: Uint8Array) => void) => {
      this.audio = onAudio;
      return { stop: this.tapStop };
    },
  );
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

class FakeAsr implements AsrStreamer {
  listener?: (transcript: AsrTranscript) => void;
  readonly send = jest.fn();
  readonly abort = jest.fn();
  readonly finish = jest.fn(async () => ({
    transcript: "",
    audioMs: 0,
    processingMs: 0,
  }));
  readonly open = jest.fn(async (): Promise<AsrStreamHandle> => ({
    sessionId: "asr-1",
    send: this.send,
    onTranscript: (listener) => {
      this.listener = listener;
    },
    finish: this.finish,
    abort: this.abort,
  }));

  hear(transcript: string) {
    this.listener?.({ transcript, audioMs: 2_000, processingMs: 100 });
  }
}

const settle = async () => {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
};

const setup = (
  awaiting: {
    id: string;
    addressedService: "dds_01" | "dds_03";
    card: DdsCardSnapshot;
  } | null = { id: "exercise-1", addressedService: "dds_01", card: CARD },
) => {
  const pbx = new FakePbx();
  const asr = new FakeAsr();
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
      ReturnType<CrewHandoffDirectory["startCall"]>,
      Parameters<CrewHandoffDirectory["startCall"]>
    >(async () => undefined),
    finishCall: jest.fn<
      ReturnType<CrewHandoffDirectory["finishCall"]>,
      Parameters<CrewHandoffDirectory["finishCall"]>
    >(async () => undefined),
  };
  const prompts = {
    ensure: jest.fn(async (text: string) => `sound:crew/${text}`),
    prepareAll: jest.fn(async () => undefined),
  };
  const awaitingHandoff = jest.fn(async () => awaiting);
  const service = new CrewHandoffService(
    true,
    pbx,
    asr,
    directory,
    prompts,
    awaitingHandoff,
  );
  service.onModuleInit();

  const call = async (dialed = "1012", exerciseId?: string) => {
    pbx.emit({
      type: "call-started",
      channelId: "c-1",
      callerNumber: "201",
      dialedNumber: dialed,
      ...(exerciseId ? { exerciseId } : {}),
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

  return {
    service,
    pbx,
    asr,
    directory,
    prompts,
    awaitingHandoff,
    call,
    finishPrompt,
  };
};

describe(CrewHandoffService.name, () => {
  it("stays off the line while telephony is disabled", () => {
    const pbx = new FakePbx();
    new CrewHandoffService(
      false,
      pbx,
      new FakeAsr(),
      {} as CrewHandoffDirectory,
      {} as never,
      jest.fn(),
    ).onModuleInit();
    expect(pbx.start).not.toHaveBeenCalled();
  });

  it("accepts and persists a complete ASR report", async () => {
    const { pbx, asr, directory, call, finishPrompt } = setup();
    await call();

    expect(pbx.captureInboundAudio).toHaveBeenCalledWith(
      "c-1",
      expect.any(Function),
    );
    expect(pbx.played).toEqual(["sound:crew/Пожарная часть 12, слушаю."]);
    await finishPrompt();

    asr.hear(
      "Москва, улица Учебная, дом 12. Пожар в квартире. На кухне открытое пламя, сильный дым. Один пострадавший.",
    );
    await settle();
    expect(pbx.played.at(-1)).toBe("sound:crew/Принято, выезжаем.");
    await finishPrompt();

    expect(directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({
        outcome: "completed",
        acknowledgements: 1,
        transcript: expect.stringContaining("Учебная"),
        validation: expect.objectContaining({ complete: true }),
        asrStatus: "completed",
      }),
    );
    expect(pbx.hungUp).toEqual(["c-1"]);
  });

  it("asks for missing facts and never accepts arbitrary speech", async () => {
    const { pbx, asr, directory, call } = setup();
    await call();
    asr.hear("Добрый день, вы меня слышите?");
    await settle();

    expect(pbx.played.at(-1)).toBe("sound:crew/Повторите адрес происшествия.");
    pbx.emit({ type: "call-ended", channelId: "c-1" });
    await settle();
    expect(directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({
        outcome: "abandoned",
        validation: expect.objectContaining({ complete: false }),
      }),
    );
  });

  it("reports local ASR unavailability without counting success", async () => {
    const runtime = setup();
    runtime.asr.open.mockRejectedValueOnce(new Error("decoder is busy"));
    await runtime.call();

    expect(runtime.pbx.played.at(-1)).toBe(
      "sound:crew/Не удалось распознать передачу. Повторите звонок позже.",
    );
    await runtime.finishPrompt();
    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({
        outcome: "abandoned",
        asrStatus: "unavailable",
      }),
    );
  });

  it("keeps a call without an accepted card out of successful handoff", async () => {
    const runtime = setup(null);
    await runtime.call();

    expect(runtime.asr.open).not.toHaveBeenCalled();
    expect(runtime.pbx.played.at(-1)).toBe(
      "sound:crew/Нет принятой карточки для передачи.",
    );
    await runtime.finishPrompt();
    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ outcome: "abandoned" }),
    );
  });

  it("answers an unknown number with the PBX line", async () => {
    const runtime = setup();
    await runtime.call("1999");
    expect(runtime.pbx.played).toEqual([`sound:crew/${UNKNOWN_NUMBER_LINE}`]);
    expect(runtime.asr.open).not.toHaveBeenCalled();
    await runtime.finishPrompt();
    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ outcome: "unknown_number" }),
    );
  });

  it("uses the exercise selected by click-to-call", async () => {
    const runtime = setup();
    await runtime.call("1012", "assigned-exercise-1");
    expect(runtime.awaitingHandoff).toHaveBeenCalledWith(
      "user-1",
      "assigned-exercise-1",
    );
  });
});
