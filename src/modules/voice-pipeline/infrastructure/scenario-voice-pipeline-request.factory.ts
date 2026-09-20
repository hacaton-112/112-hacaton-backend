import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ScenarioAudioService } from "@/modules/scenario-audio/scenario-audio.service";
import type { DialogueEntry } from "@/contracts/dialogue-preparation";

import {
  VoicePipelineRequestSchema,
  CallerReplySchema,
  type FactQuestion,
  type VoicePipelineRequest,
} from "@/contracts";
import {
  QUESTION_UNDERSTANDING_PORT,
  type QuestionUnderstandingPort,
} from "@/modules/ai-gateway";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { resolvePreparedQuestion } from "@/modules/scenario-audio/domain/prepared-dialogue";
import { VoiceRuntimeService } from "../application/voice-runtime.service";
import { abortable, requestsInstructionOverride } from "../domain/offline-turn";

import type {
  CreateVoicePipelineRequestOptions,
  RecordCallerReplyOptions,
  VoicePipelineRequestFactory,
} from "../application/voice-pipeline-request.factory";

/**
 * Настоящий источник контекста: движок сценария.
 *
 * Здесь замыкается круг — движок выдаёт разрешённые факты, а раскрытые моделью
 * возвращаются ему обратно до того, как реплика уйдёт клиенту.
 */
/** Сколько разобранных вопросов держать на сценарий: занятие идёт по кругу. */
const MAX_CACHED_QUESTIONS = 500;

const cacheKey = (scenarioVersionId: string, operatorText: string): string =>
  `${scenarioVersionId}\u0000${operatorText
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()}`;

@Injectable()
export class ScenarioVoicePipelineRequestFactory implements VoicePipelineRequestFactory {
  private readonly logger = new Logger(
    ScenarioVoicePipelineRequestFactory.name,
  );
  /**
   * Разобранные вопросы.
   *
   * Один и тот же вопрос на занятии звучит десятки раз: кеш снимает и ожидание
   * оператора, и разнобой между двумя стажёрами, которые спросили одинаково.
   */
  private readonly understood = new Map<string, readonly string[]>();
  /** Per-turn decisions include failures; they must not poison the reusable question cache. */
  private readonly turnAnswers = new Map<
    string,
    readonly string[] | undefined
  >();

  constructor(
    private readonly engine: ScenarioEngineService,
    @Inject(QUESTION_UNDERSTANDING_PORT)
    private readonly questions: QuestionUnderstandingPort,
    @Optional() private readonly audio?: ScenarioAudioService,
    @Optional() private readonly runtime?: VoiceRuntimeService,
  ) {}

  async create({
    command,
    requestId,
    sessionId,
    signal,
    initiative,
  }: CreateVoicePipelineRequestOptions): Promise<VoicePipelineRequest> {
    signal.throwIfAborted();
    const offline = this.runtime?.settings.enabled ?? false;
    const exceptionDeadlineAt = offline
      ? performance.now() + this.runtime!.settings.budgetMs
      : undefined;
    const turnSignal = offline
      ? AbortSignal.any([
          signal,
          AbortSignal.timeout(this.runtime!.settings.budgetMs),
        ])
      : signal;
    let exceptionReason: VoicePipelineRequest["exceptionReason"] =
      offline && requestsInstructionOverride(command.operatorText)
        ? "prompt-injection"
        : undefined;
    let preferPreparedReply = false;
    const turnKey = JSON.stringify([sessionId, requestId]);
    let entries: readonly DialogueEntry[] = [];
    try {
      entries = await abortable(
        this.audio?.approvedEntries(sessionId) ?? Promise.resolve([]),
        turnSignal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (!offline) throw error;
      exceptionReason ??= turnSignal.aborted
        ? "deadline"
        : "intent-unavailable";
    }

    const built = await this.engine.buildGenerationContext({
      trainingSessionId: sessionId,
      operatorText: command.operatorText,
      initiative,
      resolveAskedFacts: async (facts) => {
        if (exceptionReason) {
          this.rememberTurn(turnKey, []);
          return [];
        }
        try {
          const asked = await abortable(
            this.understand(
              requestId,
              command.operatorText,
              facts,
              turnSignal,
              entries,
              sessionId,
            ),
            turnSignal,
          );
          turnSignal.throwIfAborted();
          preferPreparedReply = (asked?.length ?? 0) > 0;
          this.rememberTurn(turnKey, asked);
          if (offline && !asked?.length) exceptionReason = "unknown-question";
          return asked;
        } catch {
          signal.throwIfAborted();
          if (!offline) {
            // Preserve the same keyword decision when recording this turn.
            this.rememberTurn(turnKey, undefined);
            this.logger.warn(
              "Intent unavailable; using Engine keyword matching",
            );
            return undefined;
          }
          exceptionReason = turnSignal.aborted
            ? "deadline"
            : "intent-unavailable";
          this.rememberTurn(turnKey, []);
          return [];
        }
      },
    });
    // Engine deliberately catches resolver failures. Parent cancellation must
    // still escape rather than producing a new fallback reply after barge-in.
    signal.throwIfAborted();
    if (offline && turnSignal.aborted) exceptionReason ??= "deadline";

    const focus = built.context.turnPlan?.focusFactIds ?? [];
    const entry =
      focus.length === 1
        ? entries.find((item) => item.factKey === focus[0])
        : undefined;
    const fact =
      entry &&
      built.context.allowedFacts.find((item) => item.id === entry.factKey);
    const reaction = built.context.turnPlan?.reactionAct;
    // Engine selects the permitted fact and reaction FIRST; the bank only chooses wording.
    const approvedReply =
      entry &&
      fact &&
      ["answer", "repeat", "acknowledge"].includes(reaction ?? "")
        ? CallerReplySchema.safeParse({
            ...built.fallbackReply,
            text: `${entry.acknowledge ? "Хорошо. " : ""}${fact.value}`,
            revealedFactIds: [fact.id],
          })
        : null;
    const fallbackReply = approvedReply?.success
      ? approvedReply.data
      : built.fallbackReply;
    // Only the Engine's permitted focus enables the keyword fast path.
    preferPreparedReply ||= Boolean(
      ["answer", "repeat", "acknowledge"].includes(reaction ?? "") &&
      focus.length === 1 &&
      fallbackReply.revealedFactIds.length === 1 &&
      fallbackReply.revealedFactIds[0] === focus[0] &&
      built.context.allowedFacts.some((item) => item.id === focus[0]),
    );
    return VoicePipelineRequestSchema.parse({
      preferPreparedReply: !exceptionReason && preferPreparedReply,
      ...(offline ? { exceptionDeadlineAt, exceptionReason } : {}),
      generation: {
        requestId,
        sessionId,
        scenarioVersionId: built.scenarioVersionId,
        operatorText: command.operatorText,
        context: built.context,
        fallbackReply,
      },
      // Звучание задаёт сценарий; клиент может подменить только сам голос и
      // только осознанно, для отладки.
      voice: {
        ...built.voice,
        voiceId: offline
          ? built.voice.voiceId
          : (command.voiceId ?? built.voice.voiceId),
      },
    });
  }

  private rememberTurn(
    requestId: string,
    asked: readonly string[] | undefined,
  ): void {
    if (this.turnAnswers.size >= MAX_CACHED_QUESTIONS) {
      const oldest = this.turnAnswers.keys().next().value;
      if (oldest !== undefined) this.turnAnswers.delete(oldest);
    }
    this.turnAnswers.set(requestId, asked);
  }

  /** Разбирает вопрос оператора, запоминая ответ на будущие повторы. */
  private async understand(
    requestId: string,
    operatorText: string,
    facts: readonly FactQuestion[],
    signal: AbortSignal,
    entries: readonly DialogueEntry[] = [],
    sessionId = "",
  ): Promise<readonly string[] | undefined> {
    signal.throwIfAborted();
    // Версия сценария не меняется в пределах звонка, а факты приходят из неё,
    // поэтому их набор и служит ключом наравне с текстом.
    const key = cacheKey(JSON.stringify([sessionId, facts]), operatorText);
    const remembered = this.understood.get(key);

    if (remembered !== undefined) {
      return remembered;
    }

    const prepared =
      this.audio?.resolveApprovedQuestion(operatorText, facts, entries) ??
      resolvePreparedQuestion(operatorText, facts);
    if (prepared !== null) {
      if (this.understood.size >= MAX_CACHED_QUESTIONS) {
        this.understood.clear();
      }
      this.understood.set(key, prepared);
      return prepared;
    }

    // Standard local mode delegates to Engine keywords. Offline mode needs an
    // explicit, fail-closed intent decision instead (including paraphrases).
    if (this.runtime?.localLlm && !this.runtime.settings.enabled) {
      return undefined;
    }

    const asked = await this.questions.understand(
      { requestId, operatorText, facts: [...facts] },
      signal,
    );
    signal.throwIfAborted();

    if (this.understood.size >= MAX_CACHED_QUESTIONS) {
      this.understood.clear();
    }

    this.understood.set(key, asked);

    return asked;
  }

  async recordReply({
    requestId,
    sessionId,
    operatorText,
    reply,
    generation,
    initiative,
  }: RecordCallerReplyOptions): Promise<void> {
    const turnKey = JSON.stringify([sessionId, requestId]);
    const recordedDecision = this.turnAnswers.has(turnKey);
    const entries =
      !recordedDecision && !this.runtime?.settings.enabled
        ? ((await this.audio?.approvedEntries(sessionId)) ?? [])
        : [];
    await this.engine.applyCallerReply({
      trainingSessionId: sessionId,
      initiative,
      // Идентификатор запроса служит идентификатором команды: повторная
      // доставка того же ответа не должна применяться дважды.
      eventId: requestId,
      operatorText,
      reply,
      generation,
      // Разбор этого же вопроса уже лежит в кеше после сборки контекста:
      // запись хода сверяется с тем же ответом, а не спрашивает модель снова.
      resolveAskedFacts: (facts) =>
        recordedDecision
          ? Promise.resolve(this.turnAnswers.get(turnKey))
          : this.runtime?.settings.enabled
            ? Promise.resolve([])
            : this.understand(
                requestId,
                operatorText,
                facts,
                new AbortController().signal,
                entries,
                sessionId,
              ),
    });
  }
}
