import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { generateId } from "@/common/utils/id";
import type {
  CrewCallAsrStatus,
  CrewCallOutcome,
  DispatchService,
} from "@/drizzle/schema";
import {
  ASR_STREAMER,
  type AsrStreamer,
  type AsrStreamHandle,
  type AsrTranscript,
} from "@/modules/asr/asr-stream.port";
import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";

import {
  CREW_SCRIPT_TIMING,
  type CrewScriptCommand,
  type CrewScriptEvent,
  type CrewScriptState,
  INITIAL_CREW_SCRIPT,
  stepCrewScript,
} from "../domain/crew-handoff-script";
import {
  type CrewHandoffValidation,
  validateCrewHandoff,
} from "../domain/crew-handoff-validation";
import {
  crewPhrase,
  crewPhrases,
  NO_ACTIVE_CARD_LINE,
} from "../domain/crew-phrases";
import type { RescueCrew } from "../infrastructure/drizzle-telephony.directory";
import {
  type TelephonyAudioTap,
  TELEPHONY_CONTROL,
  type TelephonyControlPort,
  type TelephonyEvent,
} from "../ports/telephony-control.port";

export const UNKNOWN_NUMBER_LINE = "Набранный номер не обслуживается.";
export const PBX_VOICE_ID = "serena";

export interface CrewHandoffDirectory {
  findCrewByNumber(phoneNumber: string): Promise<RescueCrew | null>;
  findWorkstationUser(extension: string): Promise<string | null>;
  listCrews(): Promise<readonly RescueCrew[]>;
  startCall(call: {
    readonly id: string;
    readonly exerciseId: string | null;
    readonly crewId: string | null;
    readonly callerUserId: string | null;
    readonly callerExtension: string;
    readonly dialedNumber: string;
    readonly channelId: string;
    readonly startedAt: Date;
    readonly correct: boolean | null;
  }): Promise<void>;
  finishCall(
    channelId: string,
    result: {
      readonly endedAt: Date;
      readonly outcome: CrewCallOutcome;
      readonly acknowledgements: number;
      readonly transcript: string;
      readonly validation: CrewHandoffValidation | null;
      readonly asrStatus: CrewCallAsrStatus;
    },
  ): Promise<void>;
}

export interface CrewPromptSource {
  ensure(text: string, voiceId: string): Promise<string>;
  prepareAll(
    lines: readonly { text: string; voiceId: string }[],
  ): Promise<void>;
}

export type AwaitingHandoff = (
  userId: string,
  exerciseId?: string,
) => Promise<{
  readonly id: string;
  readonly addressedService: DispatchService;
  readonly card: DdsCardSnapshot;
} | null>;

export const CREW_HANDOFF_DIRECTORY = Symbol("CREW_HANDOFF_DIRECTORY");
export const CREW_PROMPT_SOURCE = Symbol("CREW_PROMPT_SOURCE");
export const AWAITING_HANDOFF = Symbol("AWAITING_HANDOFF");
export const TELEPHONY_ENABLED = Symbol("TELEPHONY_ENABLED");

interface ActiveCall {
  readonly channelId: string;
  crew: RescueCrew | null;
  card: DdsCardSnapshot | null;
  script: CrewScriptState;
  transcriptParts: string[];
  validation: CrewHandoffValidation | null;
  asrStatus: CrewCallAsrStatus;
  asrStream?: AsrStreamHandle;
  audioTap?: TelephonyAudioTap;
  recognitionStopped: boolean;
  latestPlaybackId?: string;
  responseTimer?: ReturnType<typeof setTimeout>;
  limitTimer?: ReturnType<typeof setTimeout>;
  /** Реплика без автомата: неверный номер, нет карточки или ASR не поднялся. */
  directOutcome?: CrewCallOutcome;
  finished: boolean;
  queue: Promise<void>;
}

/**
 * Виртуальный наряд ДДС.
 *
 * Asterisk передаёт сюда только входящий голос оператора. Локальный Whisper
 * делает финальные расшифровки, а чистый валидатор сверяет накопленный текст с
 * неизменяемым снимком карточки. Успех не зависит от LLM и не ставится по
 * длительности звука.
 */
@Injectable()
export class CrewHandoffService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrewHandoffService.name);
  private readonly calls = new Map<string, ActiveCall>();
  private unsubscribe?: () => void;

  constructor(
    @Inject(TELEPHONY_ENABLED) private readonly enabled: boolean,
    @Inject(TELEPHONY_CONTROL) private readonly control: TelephonyControlPort,
    @Inject(ASR_STREAMER) private readonly asr: AsrStreamer,
    @Inject(CREW_HANDOFF_DIRECTORY)
    private readonly directory: CrewHandoffDirectory,
    @Inject(CREW_PROMPT_SOURCE) private readonly prompts: CrewPromptSource,
    @Inject(AWAITING_HANDOFF) private readonly awaitingHandoff: AwaitingHandoff,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) return;

    this.unsubscribe = this.control.subscribe((event) => this.handle(event));
    this.control.start();
    void this.prepareLines();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.control.stop();
    for (const call of this.calls.values()) {
      this.clearTimers(call);
      call.asrStream?.abort();
      void call.audioTap?.stop();
    }
    this.calls.clear();
  }

  private async prepareLines(): Promise<void> {
    const crews = await this.directory.listCrews().catch(() => []);

    await this.prompts.prepareAll([
      { text: UNKNOWN_NUMBER_LINE, voiceId: PBX_VOICE_ID },
      { text: NO_ACTIVE_CARD_LINE, voiceId: PBX_VOICE_ID },
      ...crews.flatMap((crew) =>
        crewPhrases(crew.callsign).map((text) => ({
          text,
          voiceId: crew.voiceId,
        })),
      ),
    ]);
  }

  handle(event: TelephonyEvent): void {
    if (event.type === "call-started") {
      void this.startCall(event);
      return;
    }

    const call = this.calls.get(event.channelId);
    if (!call) return;

    call.queue = call.queue
      .then(() => this.route(call, event))
      .catch((error: unknown) => this.fail(call, error));
  }

  private async startCall(
    event: Extract<TelephonyEvent, { type: "call-started" }>,
  ): Promise<void> {
    const call: ActiveCall = {
      channelId: event.channelId,
      crew: null,
      card: null,
      script: INITIAL_CREW_SCRIPT,
      transcriptParts: [],
      validation: null,
      asrStatus: "not_started",
      recognitionStopped: false,
      finished: false,
      queue: Promise.resolve(),
    };
    this.calls.set(event.channelId, call);

    call.queue = call.queue
      .then(async () => {
        const [crew, userId] = await Promise.all([
          this.directory.findCrewByNumber(event.dialedNumber),
          this.directory.findWorkstationUser(event.callerNumber),
        ]);
        const awaiting = userId
          ? await this.awaitingHandoff(userId, event.exerciseId)
          : null;
        call.crew = crew;
        call.card = awaiting?.card ?? null;

        await this.directory.startCall({
          id: generateId(),
          exerciseId: awaiting?.id ?? null,
          crewId: crew?.id ?? null,
          callerUserId: userId,
          callerExtension: event.callerNumber,
          dialedNumber: event.dialedNumber,
          channelId: event.channelId,
          startedAt: new Date(),
          correct: awaiting
            ? crew?.service === awaiting.addressedService
            : null,
        });

        await this.control.answer(event.channelId);

        if (!crew) {
          await this.playDirect(call, UNKNOWN_NUMBER_LINE, "unknown_number");
          return;
        }
        if (!awaiting) {
          await this.playDirect(call, NO_ACTIVE_CARD_LINE, "abandoned");
          return;
        }

        try {
          const stream = await this.asr.open("ru");
          call.asrStream = stream;
          stream.onTranscript((transcript) =>
            this.enqueueTranscript(call, transcript),
          );
          call.audioTap = await this.control.captureInboundAudio(
            event.channelId,
            (chunk) => stream.send(chunk),
          );
        } catch (error) {
          call.asrStatus = "unavailable";
          call.asrStream?.abort();
          this.logger.warn(
            `Could not start crew ASR for ${event.channelId}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
          call.latestPlaybackId = await this.control.play(
            call.channelId,
            await this.prompts.ensure(
              crewPhrase("recognition-unavailable", crew.callsign),
              crew.voiceId,
            ),
          );
          call.directOutcome = "abandoned";
          return;
        }

        call.limitTimer = this.rearm(
          call.limitTimer,
          () => this.enqueue(call, { type: "call-limit-reached" }),
          CREW_SCRIPT_TIMING.maxCallMs,
        );
        await this.feed(call, { type: "answered" });
      })
      .catch((error: unknown) => this.fail(call, error));
  }

  private async playDirect(
    call: ActiveCall,
    line: string,
    outcome: CrewCallOutcome,
  ): Promise<void> {
    call.directOutcome = outcome;
    call.latestPlaybackId = await this.control.play(
      call.channelId,
      await this.prompts.ensure(line, PBX_VOICE_ID),
    );
  }

  private async route(call: ActiveCall, event: TelephonyEvent): Promise<void> {
    switch (event.type) {
      case "playback-finished":
        if (event.playbackId !== call.latestPlaybackId) return;
        if (call.directOutcome) {
          await this.control.hangUp(call.channelId);
          await this.finish(call, call.directOutcome);
          return;
        }
        await this.feed(call, { type: "prompt-finished" });
        return;
      case "speech-started":
      case "speech-finished":
        // Границы и содержание реплик определяет Silero VAD в ASR-сервисе.
        return;
      case "call-ended": {
        if (!call.finished && !call.directOutcome && call.asrStream) {
          const final = await this.stopRecognition(call, true);
          if (final?.transcript.trim())
            await this.recordTranscript(call, final, false);
        }

        if (!call.finished) {
          if (!call.crew) await this.finish(call, "unknown_number");
          else if (call.directOutcome)
            await this.finish(call, call.directOutcome);
          else await this.feed(call, { type: "caller-hung-up" });
        }
        this.clearTimers(call);
        this.calls.delete(call.channelId);
        return;
      }
      case "call-started":
        return;
    }
  }

  private enqueueTranscript(call: ActiveCall, transcript: AsrTranscript): void {
    if (!this.calls.has(call.channelId)) return;
    call.queue = call.queue
      .then(() => this.recordTranscript(call, transcript, true))
      .catch((error: unknown) => this.fail(call, error));
  }

  private async recordTranscript(
    call: ActiveCall,
    transcript: AsrTranscript,
    announce: boolean,
  ): Promise<void> {
    const text = transcript.transcript.trim();
    if (!text || !call.card) return;
    if (call.transcriptParts.at(-1) === text) return;

    call.transcriptParts.push(text);
    call.validation = validateCrewHandoff(
      call.card,
      call.transcriptParts.join(" "),
    );

    if (announce) {
      await this.feed(call, {
        type: "report-evaluated",
        complete: call.validation.complete,
        missingFields: call.validation.missingFields,
      });
    } else {
      call.script = {
        ...call.script,
        acknowledgements: call.script.acknowledgements + 1,
        reportComplete: call.validation.complete,
      };
    }
  }

  private async feed(call: ActiveCall, event: CrewScriptEvent): Promise<void> {
    const step = stepCrewScript(call.script, event);
    call.script = step.state;
    for (const command of step.commands) await this.execute(call, command);
  }

  private async execute(
    call: ActiveCall,
    command: CrewScriptCommand,
  ): Promise<void> {
    switch (command.type) {
      case "play": {
        const crew = call.crew!;
        const media = await this.prompts.ensure(
          crewPhrase(command.prompt, crew.callsign, command.missingField),
          crew.voiceId,
        );
        call.latestPlaybackId = await this.control.play(call.channelId, media);
        return;
      }
      case "start-response-timer":
        call.responseTimer = this.rearm(
          call.responseTimer,
          () => this.enqueue(call, { type: "response-timeout" }),
          command.ms,
        );
        return;
      case "stop-response-timer":
        clearTimeout(call.responseTimer);
        call.responseTimer = undefined;
        return;
      case "stop-recognition":
        await this.stopRecognition(call, false);
        return;
      case "hang-up":
        await this.control.hangUp(call.channelId);
        return;
      case "finish":
        await this.finish(call, command.result);
        return;
    }
  }

  private enqueue(call: ActiveCall, event: CrewScriptEvent): void {
    if (!this.calls.has(call.channelId)) return;
    call.queue = call.queue
      .then(() => this.feed(call, event))
      .catch((error: unknown) => this.fail(call, error));
  }

  private async stopRecognition(
    call: ActiveCall,
    finalize: boolean,
  ): Promise<AsrTranscript | null> {
    if (call.recognitionStopped) return null;
    call.recognitionStopped = true;

    await call.audioTap?.stop().catch((error: unknown) => {
      this.logger.warn(
        `Could not stop crew media tap ${call.channelId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    });
    call.audioTap = undefined;

    if (!call.asrStream) return null;
    if (!finalize) {
      call.asrStream.abort();
      if (call.asrStatus !== "unavailable") call.asrStatus = "completed";
      return null;
    }

    try {
      const result = await call.asrStream.finish();
      call.asrStatus = "completed";
      return result;
    } catch (error) {
      call.asrStatus = "unavailable";
      this.logger.warn(
        `Could not finalise crew ASR ${call.channelId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return null;
    }
  }

  private rearm(
    timer: ReturnType<typeof setTimeout> | undefined,
    action: () => void,
    ms: number,
  ): ReturnType<typeof setTimeout> {
    clearTimeout(timer);
    const next = setTimeout(action, ms);
    next.unref?.();
    return next;
  }

  private async finish(
    call: ActiveCall,
    outcome: CrewCallOutcome,
  ): Promise<void> {
    if (call.finished) return;
    call.finished = true;

    await this.directory.finishCall(call.channelId, {
      endedAt: new Date(),
      outcome,
      acknowledgements: call.script.acknowledgements,
      transcript: call.transcriptParts.join(" "),
      validation: call.validation,
      asrStatus: call.asrStatus,
    });
  }

  private async fail(call: ActiveCall, error: unknown): Promise<void> {
    this.logger.warn(
      `Crew handoff call ${call.channelId} failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    this.clearTimers(call);
    await this.stopRecognition(call, false).catch(() => undefined);
    await this.control.hangUp(call.channelId).catch(() => undefined);
    await this.finish(call, "abandoned").catch(() => undefined);
    this.calls.delete(call.channelId);
  }

  private clearTimers(call: ActiveCall): void {
    clearTimeout(call.responseTimer);
    clearTimeout(call.limitTimer);
  }
}
