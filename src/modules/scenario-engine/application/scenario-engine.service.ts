import { Inject, Injectable, Logger } from "@nestjs/common";

import { generateId } from "@/common/utils/id";
import {
  CallerReplySchema,
  MAX_CALLER_REPLY_LENGTH,
  MAX_RECENT_TURNS,
  type CallerEmotion,
  type CallerReply,
  type CallerTurnPlan,
  type DialogueGenerationResult,
  type GenerationContext,
} from "@/contracts";
import type {
  CallerGenderValue,
  CallStage,
  EscalationTrigger,
} from "@/drizzle/schema";

import {
  matchesKeywords,
  selectAllowedFacts,
  type ScenarioFact,
} from "../domain/disclosure";
import {
  isExplicitRepeatRequest,
  planCallerTurn,
  planOpeningDelayMs,
  type CallerTurnTone,
} from "../domain/caller-turn-plan";
import {
  panicProfile,
  resolveEscalation,
  resolveVoice,
  type PanicLevel,
} from "../domain/panic-scale";
import { ScenarioEngineError } from "../domain/scenario-engine.error";
import type {
  CallStatePatch,
  CallStateSnapshot,
  LocatorHint,
  NewCallEvent,
  ScenarioStore,
  ScenarioVersionSnapshot,
} from "../ports/scenario-store.port";
import { SCENARIO_STORE } from "../scenario-engine.tokens";

const MILLISECONDS_PER_SECOND = 1_000;

const TONE_PROMPTS: Record<CallerTurnTone, string> = {
  neutral: "",
  calming:
    " Оператор сказал, что помощь уже едет: заявителю от этого чуть легче, и он это показывает.",
  forbidden:
    " Оператор велел ему успокоиться. Такое указание заявителя только злит: он отвечает на него, прежде чем продолжать.",
};

export interface CallSnapshot {
  readonly trainingSessionId: string;
  readonly scenarioVersionId: string;
  readonly scenarioCode: string;
  readonly title: string;
  readonly stage: CallStage;
  readonly panicLevel: PanicLevel;
  readonly revealedFactKeys: readonly string[];
  readonly checklistTotal: number;
  readonly checklistSatisfied: number;
  readonly locator: LocatorHint | null;
  readonly offeredAt: Date;
  readonly answeredAt: Date | null;
  readonly endedAt: Date | null;
  readonly answerNormSeconds: number;
}

/** Контекст для генерации реплики вместе с параметрами её озвучивания. */
export interface EngineCallerVoice {
  readonly voiceId: string;
  readonly gender: CallerGenderValue;
  readonly emotion: CallerEmotion;
  readonly intensity: number;
  readonly speechRate: number;
}

export interface EngineOpeningTurn {
  readonly text: string;
  readonly voice: EngineCallerVoice;
  readonly minimumResponseDelayMs: number;
}

export interface EngineGenerationContext {
  readonly scenarioVersionId: string;
  readonly context: GenerationContext;
  /**
   * Как реплика должна звучать. Решает сценарий: персонаж даёт голос и пол,
   * ступень паники — силу и темп речи. Модель пишет только слова.
   */
  readonly voice: EngineCallerVoice;
  readonly fallbackReply: CallerReply;
}

export type CallDirective =
  | { readonly type: "caller.initiative"; readonly reason: "operator-silence" }
  | { readonly type: "caller.interrupt" };

/**
 * Текст-заглушка вместо реплики оператора, когда заявитель заговаривает сам.
 * Контракт генерации требует непустой ввод, но в журнал он не попадает и в
 * поиске ключевых слов не участвует.
 */
export const INITIATIVE_OPERATOR_TEXT = "(оператор молчит)";

const secondsBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / MILLISECONDS_PER_SECOND;

/**
 * Единственный источник истины о происшествии и о ходе учебного звонка.
 *
 * Решает, какие факты заявитель вправе сообщить сейчас, ведёт его состояние и
 * пишет журнал. Реплику формулирует модель, но набор фактов и состояние задаёт
 * только этот сервис.
 */
@Injectable()
export class ScenarioEngineService {
  private readonly logger = new Logger(ScenarioEngineService.name);

  constructor(@Inject(SCENARIO_STORE) private readonly store: ScenarioStore) {}

  async startCall(input: {
    trainingSessionId: string;
    scenarioVersionId: string;
    eventId: string;
    /** Кто принимает вызов; в смоук-прогонах оператора может не быть. */
    operatorId?: string;
    now?: Date;
  }): Promise<CallSnapshot> {
    const now = input.now ?? new Date();
    const version = await this.loadVersion(input.scenarioVersionId);

    if (!version.isPublished) {
      throw new ScenarioEngineError(
        "scenario-version-not-published",
        "Only a published scenario version can be started",
      );
    }

    const state: CallStateSnapshot = {
      trainingSessionId: input.trainingSessionId,
      scenarioVersionId: version.id,
      operatorId: input.operatorId ?? null,
      stage: "offered",
      panicLevel: this.clampToScenario(
        version.persona.baselinePanicLevel,
        version,
      ),
      panicChangedAt: null,
      rngSeed: generateId(),
      interruptionsUsed: 0,
      lastInitiativeAt: null,
      operatorSilenceSince: null,
      revealedFactKeys: [],
      callerTurns: 0,
      offeredAt: now,
      answeredAt: null,
      endedAt: null,
      lastSequence: 1,
    };

    const outcome = await this.store.startCall(state, input.eventId, {
      type: "call.offered",
      actor: "system",
      occurredAt: now,
      payload: {
        scenarioCode: version.scenarioCode,
        locator: version.locator ?? null,
      },
    });

    if (outcome === "duplicate") {
      const existing = await this.getSnapshot(input.trainingSessionId);

      // Повтор той же команды идемпотентен: WebSocket переподключается, и
      // доставка дубля ожидаема. Всё остальное значит, что на этой учебной
      // сессии звонок уже был — второй раз его не начать, и отдавать чужой
      // снимок под видом нового вызова нельзя.
      if (
        existing.stage !== "offered" ||
        existing.scenarioVersionId !== version.id
      ) {
        throw new ScenarioEngineError(
          "call-already-started",
          "This training session already holds a call",
        );
      }

      return existing;
    }

    return this.toSnapshot(state, version);
  }

  /** Оператор снял трубку: разговор начинается с заданной первой реплики. */
  async acceptCall(input: {
    trainingSessionId: string;
    eventId: string;
    now?: Date;
  }): Promise<
    CallSnapshot & { openingLine: string; openingTurn: EngineOpeningTurn }
  > {
    const now = input.now ?? new Date();
    const { state, version } = await this.loadCall(input.trainingSessionId);

    this.requireStage(state, ["offered"]);

    const patch: CallStatePatch = {
      stage: "conversation",
      answeredAt: now,
      // Таймер молчания стартует только после того, как первая реплика
      // действительно закончила звучать.
      operatorSilenceSince: null,
      callerTurns: state.callerTurns + 1,
    };
    const openingVoice = this.callerVoice(state, version);

    await this.store.appendTurn(
      state.trainingSessionId,
      input.eventId,
      [
        { type: "call.accepted", actor: "operator", occurredAt: now },
        {
          type: "stage.changed",
          actor: "system",
          occurredAt: now,
          payload: { from: state.stage, to: "conversation" },
        },
        {
          // Первая реплика участвует в памяти разговора так же, как ответы
          // модели: иначе следующий ответ повторял начало звонка.
          type: "caller.reply",
          actor: "caller",
          occurredAt: now,
          payload: {
            text: version.openingLine,
            emotion: openingVoice.emotion,
            intensity: openingVoice.intensity,
            prescribed: true,
          },
        },
      ],
      patch,
    );

    return {
      ...this.toSnapshot({ ...state, ...patch }, version),
      openingLine: version.openingLine,
      openingTurn: {
        text: version.openingLine,
        voice: openingVoice,
        minimumResponseDelayMs: planOpeningDelayMs(
          state.rngSeed,
          state.panicLevel,
        ),
      },
    };
  }

  async declineCall(input: {
    trainingSessionId: string;
    eventId: string;
    now?: Date;
  }): Promise<CallSnapshot> {
    const now = input.now ?? new Date();
    const { state, version } = await this.loadCall(input.trainingSessionId);

    this.requireStage(state, ["offered"]);

    const patch: CallStatePatch = { stage: "declined", endedAt: now };

    await this.store.appendTurn(
      state.trainingSessionId,
      input.eventId,
      [
        { type: "call.declined", actor: "operator", occurredAt: now },
        {
          type: "stage.changed",
          actor: "system",
          occurredAt: now,
          payload: { from: state.stage, to: "declined" },
        },
      ],
      patch,
    );

    return this.toSnapshot({ ...state, ...patch }, version);
  }

  /**
   * Собирает контекст для модели: персона, состояние словами и только те факты,
   * которые заявитель вправе назвать на этом ходу.
   */
  async buildGenerationContext(input: {
    trainingSessionId: string;
    operatorText: string;
    /** Заявитель заговаривает сам: вопроса не было, значит и фактов по нему. */
    initiative?: boolean;
  }): Promise<EngineGenerationContext> {
    const { state, version } = await this.loadCall(input.trainingSessionId);

    this.requireStage(state, ["conversation"]);

    const matchedText = input.initiative === true ? "" : input.operatorText;
    const allowed = this.allowedFacts(state, version, matchedText);
    const profile = panicProfile(state.panicLevel);
    const recentTurns = await this.store.loadRecentTurns(
      state.trainingSessionId,
      MAX_RECENT_TURNS,
    );
    const background =
      version.persona.backgroundSounds === null
        ? ""
        : ` Фон: ${version.persona.backgroundSounds}.`;
    // Что оператор только что сделал не так или, наоборот, правильно: заявитель
    // обязан это заметить словами, а не только ступенью паники.
    const tone = this.operatorTone(version, matchedText);
    const focusCandidates = this.focusFacts(
      state,
      allowed.facts,
      allowed.fresh,
      matchedText,
      input.initiative === true,
    );
    const turnPlan = planCallerTurn({
      rngSeed: state.rngSeed,
      callerTurns: state.callerTurns,
      operatorText: matchedText,
      panicLevel: state.panicLevel,
      tone,
      initiative: input.initiative === true,
      freshFactIds: focusCandidates
        .filter((fact) => allowed.fresh.includes(fact.key))
        .map((fact) => fact.key),
      focusFactIds: focusCandidates.map((fact) => fact.key),
    });
    const focusFactIds = new Set(turnPlan.focusFactIds ?? []);
    const turnFacts = allowed.facts.filter((fact) =>
      focusFactIds.has(fact.key),
    );
    const voice = this.callerVoice(state, version);

    return {
      scenarioVersionId: version.id,
      voice,
      fallbackReply: this.fallbackReply(
        version,
        voice,
        turnPlan,
        turnFacts,
        input.initiative === true,
      ),
      context: {
        persona: {
          id: version.scenarioCode,
          language: "Russian",
          description:
            `${version.persona.displayName}. ${version.persona.condition}. ` +
            `${version.persona.speechStyle} Сейчас ${profile.description}.` +
            ` Как говорит: ${profile.speechRules}` +
            ` Так звучат его реплики: ${profile.examples
              .map((example) => `«${example}»`)
              .join(" ")}` +
            background +
            TONE_PROMPTS[tone] +
            (input.initiative === true
              ? " Оператор молчит, и заявитель не выдерживает паузы: он заговаривает сам, требует ответа."
              : ""),
        },
        // На конкретный ход модель получает не весь уже известный рассказ, а
        // только ответ на текущий вопрос. Полный набор повторно проверяется в
        // applyCallerReply, поэтому авторитет Scenario Engine сохраняется.
        allowedFacts: turnFacts.map((fact) => ({
          id: fact.key,
          value: fact.promptValue,
        })),
        // Разговор, который уже был: без него заявитель отвечает так, будто
        // звонок только начался, и повторяет одну и ту же первую фразу.
        recentTurns: [...recentTurns],
        turnPlan,
      },
    };
  }

  /**
   * Применяет реплику заявителя.
   *
   * Раскрытие факта вне разрешённого набора — нарушение инварианта: реплика
   * отбрасывается целиком и не доходит до синтеза, а попытка попадает в журнал
   * как сигнал качества промпта.
   */
  async applyCallerReply(input: {
    trainingSessionId: string;
    eventId: string;
    operatorText: string;
    reply: CallerReply;
    generation?: Pick<DialogueGenerationResult, "source" | "attempts">;
    initiative?: boolean;
    now?: Date;
  }): Promise<CallSnapshot> {
    const now = input.now ?? new Date();
    const { state, version } = await this.loadCall(input.trainingSessionId);

    this.requireStage(state, ["conversation"]);

    const initiative = input.initiative === true;
    const matchedText = initiative ? "" : input.operatorText;
    const allowed = this.allowedFacts(state, version, matchedText);
    const allowedKeys = new Set(allowed.facts.map((fact) => fact.key));
    const forbidden = input.reply.revealedFactIds.filter(
      (key) => !allowedKeys.has(key),
    );

    if (forbidden.length > 0) {
      await this.store.appendTurn(
        state.trainingSessionId,
        input.eventId,
        [
          {
            type: "fact.rejected",
            actor: "system",
            occurredAt: now,
            payload: { factKeys: forbidden },
          },
        ],
        {},
      );

      throw new ScenarioEngineError(
        "fact-not-allowed",
        `The reply reveals facts the scenario did not allow: ${forbidden.join(", ")}`,
      );
    }

    const revealedNow = input.reply.revealedFactIds.filter(
      (key) => !state.revealedFactKeys.includes(key),
    );
    const revealedFactKeys = [...state.revealedFactKeys, ...revealedNow];
    const events: NewCallEvent[] = [
      initiative
        ? {
            // Реплики оператора не было, и записывать её нельзя: расшифровка
            // разговора должна остаться правдой.
            type: "caller.initiative",
            actor: "caller",
            occurredAt: now,
            payload: { reason: "operator-silence" },
          }
        : {
            type: "operator.utterance",
            actor: "operator",
            occurredAt: now,
            payload: { text: input.operatorText },
          },
      {
        type: "caller.reply",
        actor: "caller",
        occurredAt: now,
        payload: {
          text: input.reply.text,
          emotion: input.reply.emotion,
          intensity: input.reply.intensity,
          ...(input.generation === undefined
            ? {}
            : { generation: input.generation }),
        },
      },
      ...revealedNow.map((key): NewCallEvent => ({
        type: "fact.revealed",
        actor: "caller",
        occurredAt: now,
        payload: { key },
      })),
    ];

    const patch: CallStatePatch = {
      revealedFactKeys,
      callerTurns: state.callerTurns + 1,
      // Пока реплика синтезируется и звучит, молчание оператора не идёт.
      // Транспорт запустит таймер после audio.done или безопасного fallback.
      operatorSilenceSince: null,
      ...(initiative ? { lastInitiativeAt: now } : {}),
    };

    const firedTriggers = this.triggersFromTurn(
      version,
      matchedText,
      revealedNow,
    );
    const transition = resolveEscalation({
      rules: version.escalationRules,
      currentLevel: state.panicLevel,
      floor: version.panicFloor,
      ceiling: version.panicCeiling,
      firedTriggers,
      changedAt: state.panicChangedAt,
      now,
    });

    // Сработавшее правило записывается, даже если ступень не сдвинулась: на
    // потолке шкалы запрещённая фраза оператора иначе исчезала бы бесследно,
    // а разбор занятия строится по журналу.
    for (const trigger of firedTriggers) {
      if (transition?.trigger === trigger) {
        continue;
      }

      events.push({
        type: "escalation.fired",
        actor: "system",
        occurredAt: now,
        payload: { trigger, level: state.panicLevel, applied: false },
      });
    }

    if (transition !== null) {
      patch.panicLevel = transition.level;
      patch.panicChangedAt = now;
      events.push({
        type: "panic.changed",
        actor: "system",
        occurredAt: now,
        payload: {
          from: state.panicLevel,
          to: transition.level,
          trigger: transition.trigger,
        },
      });
    }

    await this.store.appendTurn(
      state.trainingSessionId,
      input.eventId,
      events,
      patch,
    );

    return this.toSnapshot({ ...state, ...patch }, version);
  }

  /**
   * Оператор взял слово или отпустил его.
   *
   * Пока он говорит, отсчёт молчания стоит: сервер узнаёт его вопрос только
   * после распознавания, и без этой паузы заявитель начал бы говорить поверх
   * фразы, которую оператор уже произносит. Отпуская слово, оператор начинает
   * молчать заново — ждать ответа он не обязан бесконечно.
   */
  async setOperatorSpeaking(input: {
    trainingSessionId: string;
    speaking: boolean;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const { state } = await this.loadCall(input.trainingSessionId);

    if (state.stage !== "conversation") {
      return;
    }

    await this.store.appendTurn(state.trainingSessionId, generateId(), [], {
      operatorSilenceSince: input.speaking ? null : now,
    });
  }

  /** Удерживает таймер молчания, пока заявитель готовит или говорит реплику. */
  async setCallerSpeaking(input: {
    trainingSessionId: string;
    speaking: boolean;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const { state } = await this.loadCall(input.trainingSessionId);

    if (state.stage !== "conversation") {
      return;
    }

    await this.store.appendTurn(state.trainingSessionId, generateId(), [], {
      operatorSilenceSince: input.speaking ? null : now,
    });
  }

  /**
   * Ход времени: единственный способ, которым в звонке что-то происходит без
   * действия оператора. Изменения состояния записываются здесь же, а вот
   * инициативная реплика только предлагается — записывать её должен транспорт,
   * когда действительно её проиграет.
   */
  async tick(input: {
    trainingSessionId: string;
    now?: Date;
  }): Promise<readonly CallDirective[]> {
    const now = input.now ?? new Date();
    const { state, version } = await this.loadCall(input.trainingSessionId);

    if (state.stage !== "conversation" || state.operatorSilenceSince === null) {
      return [];
    }

    const silenceSeconds = secondsBetween(state.operatorSilenceSince, now);
    const transition = resolveEscalation({
      rules: version.escalationRules,
      currentLevel: state.panicLevel,
      floor: version.panicFloor,
      ceiling: version.panicCeiling,
      firedTriggers: this.triggersFromTime(version, state, silenceSeconds, now),
      changedAt: state.panicChangedAt,
      now,
    });

    if (transition !== null) {
      await this.store.appendTurn(
        state.trainingSessionId,
        generateId(),
        [
          {
            type: "panic.changed",
            actor: "system",
            occurredAt: now,
            payload: {
              from: state.panicLevel,
              to: transition.level,
              trigger: transition.trigger,
            },
          },
        ],
        { panicLevel: transition.level, panicChangedAt: now },
      );
    }

    const level = transition?.level ?? state.panicLevel;
    const profile = panicProfile(level);
    const threshold = profile.initiativeSilenceSeconds;

    if (threshold === null || silenceSeconds < threshold) {
      return [];
    }

    const sinceInitiative =
      state.lastInitiativeAt === null
        ? Number.POSITIVE_INFINITY
        : secondsBetween(state.lastInitiativeAt, now);

    if (sinceInitiative < version.initiativeCooldownSeconds) {
      return [];
    }

    return [{ type: "caller.initiative", reason: "operator-silence" }];
  }

  async endCall(input: {
    trainingSessionId: string;
    eventId: string;
    reason: string;
    now?: Date;
  }): Promise<CallSnapshot> {
    const now = input.now ?? new Date();
    const { state, version } = await this.loadCall(input.trainingSessionId);

    this.requireStage(state, ["conversation", "wrap_up"]);

    const patch: CallStatePatch = { stage: "ended", endedAt: now };

    await this.store.appendTurn(
      state.trainingSessionId,
      input.eventId,
      [
        {
          type: "call.ended",
          actor: "system",
          occurredAt: now,
          payload: { reason: input.reason },
        },
        {
          type: "stage.changed",
          actor: "system",
          occurredAt: now,
          payload: { from: state.stage, to: "ended" },
        },
      ],
      patch,
    );

    return this.toSnapshot({ ...state, ...patch }, version);
  }

  async getSnapshot(trainingSessionId: string): Promise<CallSnapshot> {
    const { state, version } = await this.loadCall(trainingSessionId);

    return this.toSnapshot(state, version);
  }

  /** Параметры синтеза для текущей ступени состояния. */
  voiceFor(
    snapshot: CallSnapshot,
    baseSpeechRate: number,
  ): ReturnType<typeof resolveVoice> {
    return resolveVoice(snapshot.panicLevel, baseSpeechRate);
  }

  private allowedFacts(
    state: CallStateSnapshot,
    version: ScenarioVersionSnapshot,
    operatorText: string,
  ): { facts: readonly ScenarioFact[]; fresh: readonly string[] } {
    return selectAllowedFacts(
      version.facts,
      {
        revealedKeys: state.revealedFactKeys,
        operatorText,
        callerTurns: state.callerTurns,
        panicLevel: state.panicLevel,
        stage: state.stage,
      },
      panicProfile(state.panicLevel).factBudget,
    );
  }

  /** Выбирает содержание одного ответа, а не всю накопленную память звонка. */
  private focusFacts(
    state: CallStateSnapshot,
    allowedFacts: readonly ScenarioFact[],
    freshFactIds: readonly string[],
    operatorText: string,
    initiative: boolean,
  ): readonly ScenarioFact[] {
    if (initiative) {
      return [];
    }

    const directAnswers = allowedFacts.filter(
      (fact) =>
        fact.disclosure.type === "on_question" &&
        matchesKeywords(operatorText, fact.disclosure.keywords),
    );

    if (directAnswers.length > 0) {
      return directAnswers;
    }

    const freshFacts = allowedFacts.filter((fact) =>
      freshFactIds.includes(fact.key),
    );

    if (freshFacts.length > 0) {
      return freshFacts;
    }

    if (!isExplicitRepeatRequest(operatorText)) {
      return [];
    }

    const lastRevealedKey = [...state.revealedFactKeys]
      .reverse()
      .find((key) => allowedFacts.some((fact) => fact.key === key));

    return lastRevealedKey === undefined
      ? []
      : allowedFacts.filter((fact) => fact.key === lastRevealedKey);
  }

  /**
   * После двух ошибок модели разговор продолжает Scenario Engine. Реплика
   * зависит от плана хода и, когда возможно, отвечает разрешённым фактом.
   */
  private fallbackReply(
    version: ScenarioVersionSnapshot,
    voice: EngineCallerVoice,
    turnPlan: CallerTurnPlan,
    focusFacts: readonly ScenarioFact[],
    initiative: boolean,
  ): CallerReply {
    const candidateFocusFact = focusFacts[0];
    const factPrefix =
      turnPlan.reactionAct === "acknowledge" ? "Хорошо. " : "";
    const factualText =
      candidateFocusFact === undefined
        ? null
        : `${factPrefix}${candidateFocusFact.promptValue}`;
    // Не отмечаем факт раскрытым, если его пришлось бы оборвать лимитом
    // контракта: журнал должен соответствовать реально произнесённым словам.
    const focusFact =
      factualText !== null && factualText.length <= MAX_CALLER_REPLY_LENGTH
        ? candidateFocusFact
        : undefined;
    let text: string;

    if (focusFact !== undefined) {
      text = factualText ?? focusFact.promptValue;
    } else {
      switch (turnPlan.reactionAct) {
        case "acknowledge":
          text = "Хорошо, я вас слышу.";
          break;
        case "emotional-reaction":
          text = initiative
            ? "Алло? Ответьте мне, пожалуйста!"
            : "Не говорите так, пожалуйста! Помогите мне.";
          break;
        case "panic-refusal":
          text = "Я не успеваю понять. Говорите короче!";
          break;
        case "clarify":
          text = "Спросите, пожалуйста, конкретнее.";
          break;
        default:
          text = version.fallbackLine;
      }
    }

    return CallerReplySchema.parse({
      text,
      emotion: voice.emotion,
      intensity: voice.intensity,
      speechRate: voice.speechRate,
      revealedFactIds: focusFact === undefined ? [] : [focusFact.key],
      endCall: false,
    });
  }

  /**
   * Как прозвучала реплика оператора для заявителя.
   *
   * Правила сценария уже знают, какие слова успокаивают, а какие запрещены;
   * здесь тот же разбор нужен до генерации, чтобы заявитель ответил на них, а
   * не продолжил диктовать адрес.
   */
  private operatorTone(
    version: ScenarioVersionSnapshot,
    operatorText: string,
  ): CallerTurnTone {
    if (operatorText.length === 0) {
      return "neutral";
    }

    const matched = version.escalationRules.filter(
      (rule) =>
        (rule.trigger === "calming_phrase" ||
          rule.trigger === "forbidden_phrase") &&
        matchesKeywords(operatorText, rule.keywords ?? []),
    );

    if (matched.some((rule) => rule.trigger === "forbidden_phrase")) {
      return "forbidden";
    }

    return matched.length > 0 ? "calming" : "neutral";
  }

  private callerVoice(
    state: CallStateSnapshot,
    version: ScenarioVersionSnapshot,
  ): EngineCallerVoice {
    return {
      voiceId: version.persona.voiceId,
      gender: version.persona.gender,
      ...resolveVoice(state.panicLevel, version.persona.baseSpeechRate),
    };
  }

  private triggersFromTurn(
    version: ScenarioVersionSnapshot,
    operatorText: string,
    revealedNow: readonly string[],
  ): EscalationTrigger[] {
    const triggers: EscalationTrigger[] = [];
    const heavyRevealed = revealedNow.some((key) =>
      version.facts.some(
        (fact) => fact.key === key && fact.severity === "heavy",
      ),
    );

    // Тяжёлый факт идёт первым: произнести вслух, что внутри дети, — самый
    // сильный сдвиг состояния, и он не должен теряться за фразой оператора.
    if (heavyRevealed) {
      triggers.push("heavy_fact_revealed");
    }

    for (const rule of version.escalationRules) {
      const isPhraseRule =
        rule.trigger === "forbidden_phrase" ||
        rule.trigger === "calming_phrase";

      if (
        isPhraseRule &&
        rule.keywords !== undefined &&
        matchesKeywords(operatorText, rule.keywords)
      ) {
        triggers.push(rule.trigger);
      }
    }

    return triggers;
  }

  private triggersFromTime(
    version: ScenarioVersionSnapshot,
    state: CallStateSnapshot,
    silenceSeconds: number,
    now: Date,
  ): EscalationTrigger[] {
    const triggers: EscalationTrigger[] = [];

    for (const rule of version.escalationRules) {
      if (
        rule.trigger === "operator_silence" &&
        rule.seconds !== undefined &&
        silenceSeconds >= rule.seconds
      ) {
        triggers.push("operator_silence");
      }

      if (
        rule.trigger === "norm_time_elapsed" &&
        rule.fraction !== undefined &&
        state.answeredAt !== null &&
        secondsBetween(state.answeredAt, now) >=
          version.answerNormSeconds * rule.fraction
      ) {
        triggers.push("norm_time_elapsed");
      }
    }

    return triggers;
  }

  private clampToScenario(
    level: PanicLevel,
    version: ScenarioVersionSnapshot,
  ): PanicLevel {
    return Math.min(
      Math.max(level, version.panicFloor),
      version.panicCeiling,
    ) as PanicLevel;
  }

  private requireStage(
    state: CallStateSnapshot,
    allowed: readonly CallStage[],
  ): void {
    if (state.stage === "ended" || state.stage === "declined") {
      throw new ScenarioEngineError(
        "call-not-active",
        `The call is already ${state.stage}`,
      );
    }

    if (!allowed.includes(state.stage)) {
      throw new ScenarioEngineError(
        "call-stage-forbidden",
        `This command is not allowed while the call is ${state.stage}`,
      );
    }
  }

  private async loadVersion(
    scenarioVersionId: string,
  ): Promise<ScenarioVersionSnapshot> {
    const version = await this.store.loadVersion(scenarioVersionId);

    if (version === null) {
      throw new ScenarioEngineError(
        "scenario-version-not-found",
        "Scenario version does not exist",
      );
    }

    return version;
  }

  private async loadCall(trainingSessionId: string): Promise<{
    state: CallStateSnapshot;
    version: ScenarioVersionSnapshot;
  }> {
    const state = await this.store.loadCall(trainingSessionId);

    if (state === null) {
      throw new ScenarioEngineError(
        "call-not-active",
        "There is no call for this training session",
      );
    }

    return { state, version: await this.loadVersion(state.scenarioVersionId) };
  }

  private toSnapshot(
    state: CallStateSnapshot,
    version: ScenarioVersionSnapshot,
  ): CallSnapshot {
    const satisfied = version.mandatoryQuestions.filter((question) =>
      question.satisfiedByFactKeys.every((key) =>
        state.revealedFactKeys.includes(key),
      ),
    ).length;

    return {
      trainingSessionId: state.trainingSessionId,
      scenarioVersionId: version.id,
      scenarioCode: version.scenarioCode,
      title: version.title,
      stage: state.stage,
      panicLevel: state.panicLevel,
      revealedFactKeys: state.revealedFactKeys,
      checklistTotal: version.mandatoryQuestions.length,
      checklistSatisfied: satisfied,
      // Локатор показывает область, а не точку: точный адрес остаётся фактом.
      locator: version.locator,
      offeredAt: state.offeredAt,
      answeredAt: state.answeredAt,
      endedAt: state.endedAt,
      answerNormSeconds: version.answerNormSeconds,
    };
  }
}
