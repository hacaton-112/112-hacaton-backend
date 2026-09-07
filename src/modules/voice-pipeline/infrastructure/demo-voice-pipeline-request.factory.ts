import { Inject, Injectable } from "@nestjs/common";

import {
  VoicePipelineRequestSchema,
  type VoicePipelineRequest,
} from "@/contracts";
import type {
  CreateVoicePipelineRequestOptions,
  VoicePipelineRequestFactory,
} from "../application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_TRANSPORT_CONFIG } from "../voice-pipeline.tokens";
import type { VoicePipelineTransportConfig } from "./voice-pipeline-transport.config";

const DEFAULT_DEMO_VOICE_ID = "Vivian";

export const createDemoVoicePipelineRequest = (
  { command, requestId, sessionId, signal }: CreateVoicePipelineRequestOptions,
  enabled: boolean,
): VoicePipelineRequest => {
  signal.throwIfAborted();

  if (!enabled) {
    throw new Error("Voice pipeline demo context is disabled");
  }

  return VoicePipelineRequestSchema.parse({
    generation: {
      requestId,
      sessionId,
      scenarioVersionId: "synthetic-fire-v1",
      operatorText: command.operatorText,
      context: {
        persona: {
          id: "synthetic-caller-1",
          description:
            "Взрослая женщина, говорит коротко и тревожно, не добавляет неизвестных деталей.",
          language: "Russian",
        },
        allowedFacts: [
          {
            id: "incident_type",
            value: "На кухне квартиры начался пожар.",
          },
          {
            id: "address",
            value: "Адрес: улица Учебная, дом 12, квартира 34.",
          },
        ],
        recentTurns: [],
      },
    },
    voiceId: command.voiceId ?? DEFAULT_DEMO_VOICE_ID,
  });
};

@Injectable()
export class DemoVoicePipelineRequestFactory implements VoicePipelineRequestFactory {
  constructor(
    @Inject(VOICE_PIPELINE_TRANSPORT_CONFIG)
    private readonly config: VoicePipelineTransportConfig,
  ) {}

  async create({
    command,
    requestId,
    sessionId,
    signal,
  }: CreateVoicePipelineRequestOptions): Promise<VoicePipelineRequest> {
    return createDemoVoicePipelineRequest(
      { command, requestId, sessionId, signal },
      this.config.demoEnabled,
    );
  }
}
