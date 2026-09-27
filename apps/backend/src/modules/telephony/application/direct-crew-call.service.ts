import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from "@nestjs/common";

import { generateId } from "@/common/utils/id";
import { CALLER_VOICES } from "@/contracts";
import type {
  CrewCallAsrStatus,
  CrewCallOutcome,
} from "@/drizzle/schema";
import {
  ASR_STREAMER,
  type AsrStreamer,
  type AsrStreamHandle,
  type AsrTranscript,
} from "@/modules/asr/ports/asr-stream.port";
import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";

import type {
  CrewCallPurpose,
  CrewProgressReportStatus,
} from "../domain/crew-call";
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
  crewProgressReport,
  NO_ACTIVE_CARD_LINE,
} from "../domain/crew-phrases";
import type { DirectCrewCallServerEventInput } from "../dto/direct-crew-call.dto";
import type { RescueCrew } from "../infrastructure/drizzle-telephony.directory";
import {
  AWAITING_HANDOFF,
  type AwaitingHandoff,
  CREW_HANDOFF_DIRECTORY,
  type CrewHandoffDirectory,
  PBX_VOICE_ID,
  UNKNOWN_NUMBER_LINE,
} from "./crew-handoff.service";

const SYNTHESIS_TIMEOUT_MS = 60_000;
const BROWSER_CALLER_EXTENSION = "browser";
export const DIRECT_CREW_REPORT_SETTLE_MS = 1_000;

export interface DirectCrewCallTransport {
  emit(event: DirectCrewCallServerEventInput): Promise<void>;
  sendAudio(audio: Uint8Array): Promise<void>;
}

export interface StartDirectCrewCall {
  readonly channelId: string;
  readonly operatorId: string;
  readonly exerciseId: string;
  readonly dialedNumber: string;
  readonly transport: DirectCrewCallTransport;
}

interface ActiveDirectCall {
  readonly channelId: string;
  readonly operatorId: string;
  readonly transport: DirectCrewCallTransport;
  crew: RescueCrew | null;
  card: DdsCardSnapshot | null;
  purpose: CrewCallPurpose;
  reportedStatus: CrewProgressReportStatus | null;
  reportText: string | null;
  script: CrewScriptState;
  transcriptParts: string[];
  validation: CrewHandoffValidation | null;
  asrStatus: CrewCallAsrStatus;
  asrStream?: AsrStreamHandle;
  recognitionStopped: boolean;
  pendingPromptId?: string;
  responseTimer?: ReturnType<typeof setTimeout>;
  evaluationTimer?: ReturnType<typeof setTimeout>;
  limitTimer?: ReturnType<typeof setTimeout>;
  directOutcome?: CrewCallOutcome;
  finished: boolean;
  queue: Promise<void>;
}

/**
 * Разговор ДДС с виртуальным нарядом без SIP-АТС.
 *
 * Транспорт только переносит PCM и события. Все решения — какой наряд вызван,
 * достаточно ли данных в докладе и чем закончился вызов — остаются в том же
 * детерминированном автомате, который использует Asterisk-адаптер.
 */
@Injectable()
export class DirectCrewCallService implements OnModuleDestroy {
  private readonly logger = new Logger(DirectCrewCallService.name);
  private readonly calls = new Map<string, ActiveDirectCall>();

  constructor(
    @Inject(ASR_STREAMER) private readonly asr: AsrStreamer,
    @Inject(CREW_HANDOFF_DIRECTORY)
    private readonly directory: CrewHandoffDirectory,
    @Inject(AWAITING_HANDOFF) private readonly awaitingHandoff: AwaitingHandoff,
    private readonly synthesis: SpeechSynthesisService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const calls = [...this.calls.values()];
    this.calls.clear();
    for (const call of calls) {
      this.clearTimers(call);
      call.asrStream?.abort();
      await this.finish(call, "abandoned", false).catch(() => undefined);
    }
  }

  has(channelId: string): boolean {
    return this.calls.has(channelId);
  }

  async start(input: StartDirectCrewCall): Promise<void> {
    if (this.calls.has(input.channelId)) {
      throw new Error("A crew call is already active on this connection");
    }

    const call: ActiveDirectCall = {
      channelId: input.channelId,
      operatorId: input.operatorId,
      transport: input.transport,
      crew: null,
      card: null,
      purpose: "handoff",
      reportedStatus: null,
      reportText: null,
      script: INITIAL_CREW_SCRIPT,
      transcriptParts: [],
      validation: null,
      asrStatus: "not_started",
      recognitionStopped: false,
      finished: false,
      queue: Promise.resolve(),
    };
    this.calls.set(input.channelId, call);
    // ASR may return a VAD-final while the greeting is still being prepared.
    // All such callbacks wait until crew/card context and the initial state
    // machine step are ready instead of racing the call setup.
    let releaseInitialization: () => void = () => undefined;
    call.queue = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });

    try {
      const [crew, awaiting] = await Promise.all([
        this.directory.findCrewByNumber(input.dialedNumber),
        this.awaitingHandoff(input.operatorId, input.exerciseId),
      ]);
      call.crew = crew;
      call.card = awaiting?.card ?? null;
      call.purpose = awaiting?.purpose ?? "handoff";
      call.reportedStatus = awaiting?.reportedStatus ?? null;

      const numberIsAllowed =
        awaiting?.allowedCrewPhoneNumbers === null ||
        awaiting?.allowedCrewPhoneNumbers.includes(input.dialedNumber) === true;
      const correct =
        awaiting !== null &&
        numberIsAllowed &&
        crew?.service === awaiting.addressedService;

      if (
        correct &&
        awaiting.purpose === "progress_check" &&
        awaiting.reportedStatus
      ) {
        call.reportText = crewProgressReport(
          crew.callsign,
          awaiting.reportedStatus,
          awaiting.card,
        );
      }

      await this.directory.startCall({
        id: generateId(),
        exerciseId: awaiting?.id ?? null,
        crewId: crew?.id ?? null,
        callerUserId: input.operatorId,
        callerExtension: BROWSER_CALLER_EXTENSION,
        dialedNumber: input.dialedNumber,
        channelId: input.channelId,
        purpose: call.purpose,
        reportedStatus: call.reportedStatus,
        reportText: call.reportText,
        startedAt: new Date(),
        correct: awaiting ? correct : null,
      });

      await call.transport.emit({
        type: "call.connected",
        dialedNumber: input.dialedNumber,
        callsign: crew?.callsign ?? null,
        purpose: call.purpose,
      });

      if (!crew) {
        await this.playDirect(call, UNKNOWN_NUMBER_LINE, "unknown_number");
        return;
      }
      if (!awaiting || !numberIsAllowed) {
        await this.playDirect(call, NO_ACTIVE_CARD_LINE, "abandoned");
        return;
      }
      if (call.reportText) {
        await this.playDirect(
          call,
          call.reportText,
          "completed",
          crew.voiceId,
        );
        return;
      }

      try {
        const stream = await this.asr.open("ru");
        call.asrStream = stream;
        stream.onTranscript((transcript) =>
          this.enqueueTranscript(call, transcript),
        );
        await call.transport.emit({ type: "listen.started" });
      } catch (error) {
        call.asrStatus = "unavailable";
        this.logger.warn(
          `Could not start direct crew ASR for ${input.channelId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
        await this.playDirect(
          call,
          crewPhrase("recognition-unavailable", crew.callsign),
          "abandoned",
          crew.voiceId,
        );
        return;
      }

      call.limitTimer = this.rearm(
        call.limitTimer,
        () => this.enqueue(call, { type: "call-limit-reached" }),
        CREW_SCRIPT_TIMING.maxCallMs,
      );
      await this.feed(call, { type: "answered" });
    } catch (error) {
      await this.fail(call, error);
    } finally {
      releaseInitialization();
    }
  }

  audio(channelId: string, chunk: Uint8Array): void {
    const call = this.calls.get(channelId);
    if (!call || call.finished || call.recognitionStopped) return;
    call.asrStream?.send(chunk);
  }

  promptPlayed(channelId: string, promptId: string): void {
    const call = this.calls.get(channelId);
    if (!call || call.pendingPromptId !== promptId) return;
    call.pendingPromptId = undefined;
    if (call.directOutcome) {
      call.queue = call.queue
        .then(() => this.finish(call, call.directOutcome!))
        .catch((error: unknown) => this.fail(call, error));
      return;
    }
    this.enqueue(call, { type: "prompt-finished" });
  }

  async end(channelId: string): Promise<void> {
    const call = this.calls.get(channelId);
    if (!call || call.finished) return;

    clearTimeout(call.evaluationTimer);
    call.evaluationTimer = undefined;
    call.queue = call.queue
      .then(async () => {
        if (call.asrStream && !call.recognitionStopped) {
          const final = await this.stopRecognition(call, true);
          if (final?.transcript.trim()) {
            await this.recordTranscript(call, final, false);
          }
        }

        if (call.directOutcome) {
          await this.finish(call, call.directOutcome);
          return;
        }
        await this.feed(call, { type: "caller-hung-up" });
      })
      .catch((error: unknown) => this.fail(call, error));
    await call.queue;
  }

  private async playDirect(
    call: ActiveDirectCall,
    line: string,
    outcome: CrewCallOutcome,
    voiceId = PBX_VOICE_ID,
  ): Promise<void> {
    call.directOutcome = outcome;
    await this.play(call, line, voiceId);
  }

  private enqueueTranscript(
    call: ActiveDirectCall,
    transcript: AsrTranscript,
  ): void {
    if (!this.calls.has(call.channelId)) return;
    call.queue = call.queue
      .then(() => this.recordTranscript(call, transcript, true))
      .catch((error: unknown) => this.fail(call, error));
  }

  private async recordTranscript(
    call: ActiveDirectCall,
    transcript: AsrTranscript,
    announce: boolean,
  ): Promise<void> {
    const text = transcript.transcript.trim();
    if (!text || !call.card || call.transcriptParts.at(-1) === text) return;

    call.transcriptParts.push(text);
    call.validation = validateCrewHandoff(
      call.card,
      call.transcriptParts.join(" "),
    );
    call.script = {
      ...call.script,
      reportComplete: call.validation.complete,
    };
    await call.transport.emit({
      type: "transcript",
      text,
      complete: call.validation.complete,
      missingFields: [...call.validation.missingFields],
    });

    if (announce) {
      // Один доклад часто состоит из нескольких ASR-финалов, разделённых
      // естественными паузами. Не перебиваем оператора после первой части:
      // отвечаем только когда в течение короткого окна не пришло продолжение.
      clearTimeout(call.responseTimer);
      call.responseTimer = undefined;
      call.evaluationTimer = this.rearm(
        call.evaluationTimer,
        () => {
          const validation = call.validation;
          if (!validation || call.finished) return;
          this.enqueue(call, {
            type: "report-evaluated",
            complete: validation.complete,
            missingFields: validation.missingFields,
          });
        },
        DIRECT_CREW_REPORT_SETTLE_MS,
      );
    } else {
      call.script = {
        ...call.script,
        acknowledgements: call.script.acknowledgements + 1,
        reportComplete: call.validation.complete,
      };
    }
  }

  private async feed(
    call: ActiveDirectCall,
    event: CrewScriptEvent,
  ): Promise<void> {
    const step = stepCrewScript(call.script, event);
    call.script = step.state;
    for (const command of step.commands) await this.execute(call, command);
  }

  private async execute(
    call: ActiveDirectCall,
    command: CrewScriptCommand,
  ): Promise<void> {
    switch (command.type) {
      case "play": {
        const crew = call.crew!;
        await this.play(
          call,
          crewPhrase(command.prompt, crew.callsign, command.missingField),
          crew.voiceId,
        );
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
        return;
      case "finish":
        await this.finish(call, command.result);
        return;
    }
  }

  private async play(
    call: ActiveDirectCall,
    text: string,
    voiceId: string,
  ): Promise<void> {
    const voice =
      CALLER_VOICES.find((candidate) => candidate.id === voiceId) ??
      CALLER_VOICES[0];
    const promptId = generateId();
    let started = false;

    call.pendingPromptId = promptId;
    for await (const event of this.synthesis.synthesize(
      {
        requestId: promptId,
        sessionId: call.channelId,
        text,
        language: "Russian",
        voiceId: voice.id,
        gender: voice.gender,
        emotion: "calm",
        intensity: 0.3,
        speechRate: 1,
      },
      AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS),
    )) {
      if (event.type !== "audio.chunk") continue;
      if (!started) {
        started = true;
        await call.transport.emit({
          type: "audio.start",
          promptId,
          text,
          sampleRate: event.chunk.sampleRate,
        });
      }
      await call.transport.sendAudio(event.chunk.audio);
    }

    if (!started) throw new Error("Crew speech synthesis returned no audio");
    await call.transport.emit({ type: "audio.done", promptId });
  }

  private enqueue(call: ActiveDirectCall, event: CrewScriptEvent): void {
    if (!this.calls.has(call.channelId)) return;
    call.queue = call.queue
      .then(() => this.feed(call, event))
      .catch((error: unknown) => this.fail(call, error));
  }

  private async stopRecognition(
    call: ActiveDirectCall,
    finalize: boolean,
  ): Promise<AsrTranscript | null> {
    if (call.recognitionStopped) return null;
    call.recognitionStopped = true;
    await call.transport.emit({ type: "listen.stopped" });

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
        `Could not finalise direct crew ASR ${call.channelId}: ${
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
    call: ActiveDirectCall,
    outcome: CrewCallOutcome,
    notify = true,
  ): Promise<void> {
    if (call.finished) return;
    call.finished = true;
    this.clearTimers(call);

    await this.directory.finishCall(call.channelId, {
      endedAt: new Date(),
      outcome,
      acknowledgements: call.script.acknowledgements,
      transcript: call.transcriptParts.join(" "),
      validation: call.validation,
      asrStatus: call.asrStatus,
    });
    if (notify) await call.transport.emit({ type: "call.ended", outcome });
    this.calls.delete(call.channelId);
  }

  private async fail(call: ActiveDirectCall, error: unknown): Promise<void> {
    this.logger.warn(
      `Direct crew call ${call.channelId} failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    this.clearTimers(call);
    await this.stopRecognition(call, false).catch(() => undefined);
    await call.transport
      .emit({
        type: "error",
        code: "call-failed",
        message: "Не удалось продолжить разговор с нарядом",
      })
      .catch(() => undefined);
    await this.finish(call, "abandoned").catch(() => undefined);
  }

  private clearTimers(call: ActiveDirectCall): void {
    clearTimeout(call.responseTimer);
    clearTimeout(call.evaluationTimer);
    clearTimeout(call.limitTimer);
  }
}
