import type {
  CallerReply,
  DialogueGenerationResult,
  VoicePipelineRequest,
  VoicePipelineSpeakCommand,
} from "@/contracts";

export interface CreateVoicePipelineRequestOptions {
  command: VoicePipelineSpeakCommand;
  requestId: string;
  sessionId: string;
  signal: AbortSignal;
  /** Ход начал заявитель, а не оператор: вопроса не было. */
  initiative?: boolean;
}

export interface RecordCallerReplyOptions {
  requestId: string;
  sessionId: string;
  operatorText: string;
  reply: CallerReply;
  generation: Pick<DialogueGenerationResult, "source" | "attempts">;
  initiative?: boolean;
}

export interface VoicePipelineRequestFactory {
  create(
    options: CreateVoicePipelineRequestOptions,
  ): Promise<VoicePipelineRequest>;

  /**
   * Возвращает раскрытые факты в источник истины до того, как реплика уйдёт
   * клиенту. Бросает, если модель раскрыла лишнее: такой ответ не должен ни
   * дойти до оператора, ни сдвинуть состояние звонка.
   */
  recordReply(options: RecordCallerReplyOptions): Promise<void>;
}
