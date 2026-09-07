import type {
  VoicePipelineRequest,
  VoicePipelineSpeakCommand,
} from "@/contracts";

export interface CreateVoicePipelineRequestOptions {
  command: VoicePipelineSpeakCommand;
  requestId: string;
  sessionId: string;
  signal: AbortSignal;
}

export interface VoicePipelineRequestFactory {
  create(
    options: CreateVoicePipelineRequestOptions,
  ): Promise<VoicePipelineRequest>;
}
