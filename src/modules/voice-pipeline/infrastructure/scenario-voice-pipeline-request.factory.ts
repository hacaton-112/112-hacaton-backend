import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  VoicePipelineRequestSchema,
  type FactQuestion,
  type VoicePipelineRequest,
} from "@/contracts";
import {
  QUESTION_UNDERSTANDING_PORT,
  type QuestionUnderstandingPort,
} from "@/modules/ai-gateway";
import { ScenarioEngineService } from "@/modules/scenario-engine";

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

  constructor(
    private readonly engine: ScenarioEngineService,
    @Inject(QUESTION_UNDERSTANDING_PORT)
    private readonly questions: QuestionUnderstandingPort,
  ) {}

  async create({
    command,
    requestId,
    sessionId,
    signal,
    initiative,
  }: CreateVoicePipelineRequestOptions): Promise<VoicePipelineRequest> {
    signal.throwIfAborted();

    const built = await this.engine.buildGenerationContext({
      trainingSessionId: sessionId,
      operatorText: command.operatorText,
      initiative,
      resolveAskedFacts: (facts) =>
        this.understand(requestId, command.operatorText, facts, signal),
    });

    return VoicePipelineRequestSchema.parse({
      generation: {
        requestId,
        sessionId,
        scenarioVersionId: built.scenarioVersionId,
        operatorText: command.operatorText,
        context: built.context,
        fallbackReply: built.fallbackReply,
      },
      // Звучание задаёт сценарий; клиент может подменить только сам голос и
      // только осознанно, для отладки.
      voice: {
        ...built.voice,
        voiceId: command.voiceId ?? built.voice.voiceId,
      },
    });
  }

  /** Разбирает вопрос оператора, запоминая ответ на будущие повторы. */
  private async understand(
    requestId: string,
    operatorText: string,
    facts: readonly FactQuestion[],
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    // Версия сценария не меняется в пределах звонка, а факты приходят из неё,
    // поэтому их набор и служит ключом наравне с текстом.
    const key = cacheKey(facts.map((fact) => fact.id).join(","), operatorText);
    const remembered = this.understood.get(key);

    if (remembered !== undefined) {
      return remembered;
    }

    const asked = await this.questions.understand(
      { requestId, operatorText, facts: [...facts] },
      signal,
    );

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
        this.understand(
          requestId,
          operatorText,
          facts,
          new AbortController().signal,
        ),
    });
  }
}
