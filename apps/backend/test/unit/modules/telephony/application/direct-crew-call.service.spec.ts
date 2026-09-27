import type {
  AsrStreamer,
  AsrStreamHandle,
  AsrTranscript,
} from "@/modules/asr/ports/asr-stream.port";
import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";
import {
  DIRECT_CREW_REPORT_SETTLE_MS,
  type DirectCrewCallTransport,
  DirectCrewCallService,
} from "@/modules/telephony/application/direct-crew-call.service";
import type {
  AwaitingHandoff,
  CrewHandoffDirectory,
} from "@/modules/telephony/application/crew-handoff.service";
import type { DirectCrewCallServerEventInput } from "@/modules/telephony/dto/direct-crew-call.dto";
import type { RescueCrew } from "@/modules/telephony/infrastructure/drizzle-telephony.directory";
import type { SpeechSynthesisService } from "@/modules/speech-synthesis";

const CREW: RescueCrew = {
  id: "crew-fire",
  service: "dds_01",
  callsign: "Пожарная часть 12",
  phoneNumber: "1012",
  voiceId: "ryan",
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

  hear(transcript: string): void {
    this.listener?.({ transcript, audioMs: 2_000, processingMs: 100 });
  }
}

class FakeTransport implements DirectCrewCallTransport {
  readonly events: DirectCrewCallServerEventInput[] = [];
  readonly audio: Uint8Array[] = [];

  emit = jest.fn(async (event: DirectCrewCallServerEventInput) => {
    this.events.push(event);
  });
  sendAudio = jest.fn(async (audio: Uint8Array) => {
    this.audio.push(audio);
  });

  lastPromptId(): string {
    const event = [...this.events]
      .reverse()
      .find((candidate) => candidate.type === "audio.start");
    if (!event || event.type !== "audio.start") throw new Error("No prompt");
    return event.promptId;
  }
}

const synthesis = {
  async *synthesize() {
    yield {
      type: "audio.chunk" as const,
      chunk: {
        streamId: "stream-1",
        sequence: 0,
        sampleRate: 24_000,
        channels: 1 as const,
        format: "pcm_s16le" as const,
        isFinal: true,
        audio: new Uint8Array([1, 0, 2, 0]),
      },
    };
  },
} as unknown as SpeechSynthesisService;

const settle = async () => {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
};

type AwaitingResult = NonNullable<Awaited<ReturnType<AwaitingHandoff>>>;

const awaiting: AwaitingResult = {
  id: "68e4085a-a84f-435e-804f-8a242db80385",
  addressedService: "dds_01",
  card: CARD,
  purpose: "handoff",
  reportedStatus: null,
  allowedCrewPhoneNumbers: ["1012"],
};

const setup = (context: AwaitingResult | null = awaiting) => {
  const asr = new FakeAsr();
  const transport = new FakeTransport();
  const directory: jest.Mocked<CrewHandoffDirectory> = {
    findCrewByNumber: jest.fn(async (number) =>
      number === CREW.phoneNumber ? CREW : null,
    ),
    findWorkstationUser: jest.fn<
      ReturnType<CrewHandoffDirectory["findWorkstationUser"]>,
      Parameters<CrewHandoffDirectory["findWorkstationUser"]>
    >(async () => null),
    listCrews: jest.fn(async () => [CREW]),
    startCall: jest.fn<
      ReturnType<CrewHandoffDirectory["startCall"]>,
      Parameters<CrewHandoffDirectory["startCall"]>
    >(async () => undefined),
    finishCall: jest.fn<
      ReturnType<CrewHandoffDirectory["finishCall"]>,
      Parameters<CrewHandoffDirectory["finishCall"]>
    >(async () => undefined),
  };
  const awaitingHandoff = jest.fn(async () => context);
  const service = new DirectCrewCallService(
    asr,
    directory,
    awaitingHandoff,
    synthesis,
  );
  const start = (dialedNumber = "1012") =>
    service.start({
      channelId: "browser-call-1",
      operatorId: "operator-1",
      exerciseId: "68e4085a-a84f-435e-804f-8a242db80385",
      dialedNumber,
      transport,
    });

  return { service, asr, transport, directory, awaitingHandoff, start };
};

describe(DirectCrewCallService.name, () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("streams prompts and accepts a complete report without a workstation", async () => {
    const runtime = setup();
    await runtime.start();

    expect(runtime.awaitingHandoff).toHaveBeenCalledWith(
      "operator-1",
      "68e4085a-a84f-435e-804f-8a242db80385",
    );
    expect(runtime.directory.findWorkstationUser).not.toHaveBeenCalled();
    expect(runtime.directory.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ callerExtension: "browser", correct: true }),
    );
    expect(runtime.transport.audio).toHaveLength(1);
    runtime.service.promptPlayed(
      "browser-call-1",
      runtime.transport.lastPromptId(),
    );
    await settle();

    runtime.service.audio("browser-call-1", new Uint8Array([3, 0]));
    expect(runtime.asr.send).toHaveBeenCalledWith(new Uint8Array([3, 0]));
    runtime.asr.hear(
      "Москва, улица Учебная, дом 12. Пожар в квартире. На кухне открытое пламя и сильный дым. Один пострадавший.",
    );
    await settle();

    expect(
      runtime.transport.events.some(
        (event) => event.type === "transcript" && event.complete,
      ),
    ).toBe(true);
    jest.advanceTimersByTime(DIRECT_CREW_REPORT_SETTLE_MS);
    await settle();
    runtime.service.promptPlayed(
      "browser-call-1",
      runtime.transport.lastPromptId(),
    );
    await settle();

    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "browser-call-1",
      expect.objectContaining({
        outcome: "completed",
        acknowledgements: 1,
        asrStatus: "completed",
      }),
    );
    expect(runtime.transport.events.at(-1)).toEqual({
      type: "call.ended",
      outcome: "completed",
    });
  });

  it("waits for consecutive ASR fragments before replying", async () => {
    const runtime = setup();
    await runtime.start();
    runtime.service.promptPlayed(
      "browser-call-1",
      runtime.transport.lastPromptId(),
    );
    await settle();

    runtime.asr.hear("Москва, улица Учебная, дом 12.");
    await settle();
    jest.advanceTimersByTime(DIRECT_CREW_REPORT_SETTLE_MS - 1);
    runtime.asr.hear(
      "Пожар в квартире. На кухне открытое пламя и сильный дым. Один пострадавший.",
    );
    await settle();

    const promptsBeforePause = runtime.transport.events.filter(
      (event) => event.type === "audio.start",
    );
    expect(promptsBeforePause).toHaveLength(1);

    jest.advanceTimersByTime(DIRECT_CREW_REPORT_SETTLE_MS);
    await settle();
    const promptsAfterPause = runtime.transport.events.filter(
      (event) => event.type === "audio.start",
    );
    expect(promptsAfterPause).toHaveLength(2);
    expect(
      runtime.transport.events.filter((event) => event.type === "transcript"),
    ).toHaveLength(2);
  });

  it("answers an unknown number and records it deterministically", async () => {
    const runtime = setup();
    await runtime.start("1999");
    expect(runtime.asr.open).not.toHaveBeenCalled();

    runtime.service.promptPlayed(
      "browser-call-1",
      runtime.transport.lastPromptId(),
    );
    await settle();

    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "browser-call-1",
      expect.objectContaining({ outcome: "unknown_number" }),
    );
  });

  it("finishes an interrupted browser call as abandoned", async () => {
    const runtime = setup();
    await runtime.start();
    await runtime.service.end("browser-call-1");

    expect(runtime.asr.finish).toHaveBeenCalled();
    expect(runtime.directory.finishCall).toHaveBeenCalledWith(
      "browser-call-1",
      expect.objectContaining({ outcome: "abandoned" }),
    );
  });
});
