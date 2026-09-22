import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { generateId } from "@/common/utils/id";
import type { CrewCallOutcome, DispatchService } from "@/drizzle/schema";

import {
  CREW_SCRIPT_TIMING,
  type CrewScriptCommand,
  type CrewScriptEvent,
  type CrewScriptState,
  INITIAL_CREW_SCRIPT,
  stepCrewScript,
} from "../domain/crew-handoff-script";
import { crewPhrase, crewPhrases } from "../domain/crew-phrases";
import type { RescueCrew } from "../infrastructure/drizzle-telephony.directory";
import {
  TELEPHONY_CONTROL,
  type TelephonyControlPort,
  type TelephonyEvent,
} from "../ports/telephony-control.port";

/** Что АТС говорит на номер, которого нет в справочнике нарядов. */
export const UNKNOWN_NUMBER_LINE = "Набранный номер не обслуживается.";
/** Голос автоинформатора АТС — не голос наряда. */
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
    },
  ): Promise<void>;
}

export interface CrewPromptSource {
  ensure(text: string, voiceId: string): Promise<string>;
  prepareAll(
    lines: readonly { text: string; voiceId: string }[],
  ): Promise<void>;
}

/** Доставка ДДС, которую диспетчер принял и ещё не передал наряду. */
export type AwaitingHandoff = (
  userId: string,
  exerciseId?: string,
) => Promise<{
  readonly id: string;
  readonly addressedService: DispatchService;
} | null>;

export const CREW_HANDOFF_DIRECTORY = Symbol("CREW_HANDOFF_DIRECTORY");
export const CREW_PROMPT_SOURCE = Symbol("CREW_PROMPT_SOURCE");
export const AWAITING_HANDOFF = Symbol("AWAITING_HANDOFF");
export const TELEPHONY_ENABLED = Symbol("TELEPHONY_ENABLED");

interface ActiveCall {
  readonly channelId: string;
  /** `null` — набран несуществующий номер, отвечает автоинформатор. */
  crew: RescueCrew | null;
  script: CrewScriptState;
  /** Реагируем только на конец последней реплики: прежние могли быть вытеснены. */
  latestPlaybackId?: string;
  silenceTimer?: ReturnType<typeof setTimeout>;
  limitTimer?: ReturnType<typeof setTimeout>;
  /** Страховка на случай, когда конец фразы так и не пришёл от АТС. */
  phraseTimer?: ReturnType<typeof setTimeout>;
  finished: boolean;
  /** События одного звонка обрабатываются строго по очереди. */
  queue: Promise<void>;
}

/**
 * Наряд на том конце провода.
 *
 * Отвечает на звонок с рабочего места ДДС, ведёт разговор по сценарию
 * квитирования и записывает звонок к доставке, которую диспетчер передаёт.
 * Разговоры живут в памяти процесса: учебный контур обслуживает один
 * экземпляр backend, а оборванный перезапуском звонок диспетчер просто
 * повторит.
 */
@Injectable()
export class CrewHandoffService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrewHandoffService.name);
  private readonly calls = new Map<string, ActiveCall>();
  private unsubscribe?: () => void;

  constructor(
    @Inject(TELEPHONY_ENABLED) private readonly enabled: boolean,
    @Inject(TELEPHONY_CONTROL) private readonly control: TelephonyControlPort,
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
    for (const call of this.calls.values()) this.clearTimers(call);
    this.calls.clear();
  }

  /** Озвучивает реплики всех нарядов заранее, чтобы звонок не ждал синтеза. */
  private async prepareLines(): Promise<void> {
    const crews = await this.directory.listCrews().catch(() => []);

    await this.prompts.prepareAll([
      { text: UNKNOWN_NUMBER_LINE, voiceId: PBX_VOICE_ID },
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
      script: INITIAL_CREW_SCRIPT,
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

        await this.directory.startCall({
          id: generateId(),
          exerciseId: awaiting?.id ?? null,
          crewId: crew?.id ?? null,
          callerUserId: userId,
          callerExtension: event.callerNumber,
          dialedNumber: event.dialedNumber,
          channelId: event.channelId,
          startedAt: new Date(),
          // Звонок без принятой карточки ни правильным, ни ошибочным не бывает.
          correct: awaiting
            ? crew?.service === awaiting.addressedService
            : null,
        });

        await this.control.answer(event.channelId);

        if (!crew) {
          call.latestPlaybackId = await this.control.play(
            event.channelId,
            await this.prompts.ensure(UNKNOWN_NUMBER_LINE, PBX_VOICE_ID),
          );
          return;
        }

        await this.control.detectSpeech(event.channelId);
        call.limitTimer = this.rearm(
          call.limitTimer,
          () => this.enqueue(call, { type: "call-limit-reached" }),
          CREW_SCRIPT_TIMING.maxCallMs,
        );
        await this.feed(call, { type: "answered" });
      })
      .catch((error: unknown) => this.fail(call, error));
  }

  private async route(call: ActiveCall, event: TelephonyEvent): Promise<void> {
    switch (event.type) {
      case "playback-finished":
        if (event.playbackId !== call.latestPlaybackId) return;
        if (!call.crew) {
          await this.control.hangUp(call.channelId);
          return;
        }
        await this.feed(call, { type: "prompt-finished" });
        return;
      case "speech-started":
        call.phraseTimer = this.rearm(
          call.phraseTimer,
          () =>
            this.enqueue(call, {
              type: "speech-finished",
              durationMs: CREW_SCRIPT_TIMING.maxPhraseMs,
            }),
          CREW_SCRIPT_TIMING.maxPhraseMs,
        );
        await this.feed(call, { type: "speech-started" });
        return;
      case "speech-finished":
        clearTimeout(call.phraseTimer);
        call.phraseTimer = undefined;
        await this.feed(call, {
          type: "speech-finished",
          durationMs: event.durationMs,
        });
        return;
      case "call-ended":
        if (!call.crew && !call.finished) {
          await this.finish(call, "unknown_number");
        } else {
          await this.feed(call, { type: "caller-hung-up" });
        }
        this.clearTimers(call);
        this.calls.delete(call.channelId);
        return;
      case "call-started":
        return;
    }
  }

  private async feed(call: ActiveCall, event: CrewScriptEvent): Promise<void> {
    const step = stepCrewScript(call.script, event);
    call.script = step.state;

    for (const command of step.commands) {
      await this.execute(call, command);
    }
  }

  private async execute(
    call: ActiveCall,
    command: CrewScriptCommand,
  ): Promise<void> {
    switch (command.type) {
      case "play": {
        const crew = call.crew!;
        const media = await this.prompts.ensure(
          crewPhrase(command.prompt, command.index, crew.callsign),
          crew.voiceId,
        );
        call.latestPlaybackId = await this.control.play(call.channelId, media);
        return;
      }
      case "start-silence-timer":
        call.silenceTimer = this.rearm(
          call.silenceTimer,
          () => this.enqueue(call, { type: "silence-elapsed" }),
          command.ms,
        );
        return;
      case "stop-silence-timer":
        clearTimeout(call.silenceTimer);
        call.silenceTimer = undefined;
        return;
      case "hang-up":
        await this.control.hangUp(call.channelId);
        return;
      case "finish":
        await this.finish(call, command.result);
        return;
    }
  }

  /** Событие таймера встаёт в ту же очередь, что и события линии. */
  private enqueue(call: ActiveCall, event: CrewScriptEvent): void {
    if (!this.calls.has(call.channelId)) return;

    call.queue = call.queue
      .then(() => this.feed(call, event))
      .catch((error: unknown) => this.fail(call, error));
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
    });
  }

  /** Сбой посреди разговора: наряд кладёт трубку, звонок не теряется. */
  private async fail(call: ActiveCall, error: unknown): Promise<void> {
    this.logger.warn(
      `Crew handoff call ${call.channelId} failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    this.clearTimers(call);
    await this.control.hangUp(call.channelId).catch(() => undefined);
    await this.finish(
      call,
      call.script.acknowledgements > 0 ? "completed" : "abandoned",
    ).catch(() => undefined);
  }

  private clearTimers(call: ActiveCall): void {
    clearTimeout(call.silenceTimer);
    clearTimeout(call.limitTimer);
    clearTimeout(call.phraseTimer);
  }
}
