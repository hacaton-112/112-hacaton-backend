import { Inject, Injectable, Optional } from "@nestjs/common";
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
  /**
   * Разобранные вопросы.
   *
   * Один и тот же вопрос на занятии звучит десятки раз: кеш снимает и ожидание
   * оператора, и разнобой между двумя стажёрами, которые спросили одинаково.
   */
  private readonly understood = new Map<string, readonly string[]>();
  /** Per-turn decisions include failures; they must not poison the reusable question cache. */
  private readonly turnAnswers = new Map<string, readonly string[]>();

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
    let exceptionReason: VoicePipelineRequest["exceptionReason"];
    let preferPreparedReply = false;
    const entries = (await this.audio?.approvedEntries(sessionId)) ?? [];

    const built = await this.engine.buildGenerationContext({
      trainingSessionId: sessionId,
      operatorText: command.operatorText,
      initiative,
      resolveAskedFacts: async (facts) => {
        if (offline && requestsInstructionOverride(command.operatorText)) {
          exceptionReason = "prompt-injection";
          this.rememberTurn(requestId, []);
          return [];
        }
        try {
          const asked = await this.understand(
            requestId,
            command.operatorText,
            facts,
            turnSignal,
            entries,
            sessionId,
          );
          // Exact questions need no model. Paraphrases may use the local intent
          // parser once, but still reuse approved wording and recorded audio.
          preferPreparedReply = asked.length > 0;
          this.rememberTurn(requestId, asked);
          if (offline && !asked.length) exceptionReason = "unknown-question";
          return asked;
        } catch (error) {
          signal.throwIfAborted();
          if (!offline) throw error;
          exceptionReason = turnSignal.aborted
            ? "deadline"
            : "intent-unavailable";
          this.rememberTurn(requestId, []);
          return [];
        }
      },
    });

    signal.throwIfAborted();
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
    // Non-factual engine reactions (calming, clarification, refusal) can also
    // use approved recordings. An unknown question must never disclose a fact.
    if (
      exceptionReason === "unknown-question" &&
      fallbackReply.revealedFactIds.length === 0 &&
      [
        "acknowledge",
        "emotional-reaction",
        "panic-refusal",
        "clarify",
        "hesitate",
        "self-correct",
      ].includes(reaction ?? "")
    )
      exceptionReason = undefined;
    return VoicePipelineRequestSchema.parse({
      preferPreparedReply,
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

  private rememberTurn(requestId: string, asked: readonly string[]): void {
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
  ): Promise<readonly string[]> {
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
    const asked =
      prepared ??
      (await abortable(
        this.questions.understand(
          { requestId, operatorText, facts: [...facts] },
          signal,
        ),
        signal,
      ));

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
    const entries = (await this.audio?.approvedEntries(sessionId)) ?? [];
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
        this.turnAnswers.has(requestId)
          ? Promise.resolve(this.turnAnswers.get(requestId)!)
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
