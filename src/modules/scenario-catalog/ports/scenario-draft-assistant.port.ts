export interface ScenarioDraftAssistantRequest {
  readonly brief: string;
  readonly validationFeedback?: string;
}

/** Provider-neutral boundary: output is untrusted until ScenarioSeedSchema. */
export interface ScenarioDraftAssistantPort {
  generate(
    request: ScenarioDraftAssistantRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export const SCENARIO_DRAFT_ASSISTANT = Symbol("SCENARIO_DRAFT_ASSISTANT");
