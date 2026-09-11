import { Injectable } from "@nestjs/common";

import {
  VoicePipelineRequestSchema,
  type VoicePipelineRequest,
} from "@/contracts";
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
@Injectable()
export class ScenarioVoicePipelineRequestFactory implements VoicePipelineRequestFactory {
  constructor(private readonly engine: ScenarioEngineService) {}

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
    });
  }
}
