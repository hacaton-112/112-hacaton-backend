import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import {
  AppConflictException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";

import { buildScenarioSeedFromSuggestion } from "../domain/scenario-assistant-suggestion";
import type {
  GenerateScenarioDraftResponse,
  PublishScenarioRequest,
} from "../dto/scenario-authoring.dto";
import {
  SCENARIO_AUTHORING_REPOSITORY,
  ScenarioAuthoringConflictError,
  type PublishedScenario,
  type ScenarioAuthoringRepository,
} from "../ports/scenario-authoring.repository";
import {
  SCENARIO_DRAFT_ASSISTANT,
  type ScenarioDraftAssistantPort,
} from "../ports/scenario-draft-assistant.port";

const MAX_ASSISTANT_ATTEMPTS = 2;

@Injectable()
export class ScenarioAuthoringService {
  private readonly logger = new Logger(ScenarioAuthoringService.name);

  constructor(
    @Inject(SCENARIO_DRAFT_ASSISTANT)
    private readonly assistant: ScenarioDraftAssistantPort,
    @Inject(SCENARIO_AUTHORING_REPOSITORY)
    private readonly repository: ScenarioAuthoringRepository,
  ) {}

  async generateDraft(brief: string): Promise<GenerateScenarioDraftResponse> {
    const code = `S-AI-${generateId().slice(0, 8).toUpperCase()}`;
    let feedback: string | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ASSISTANT_ATTEMPTS; attempt += 1) {
      try {
        const suggestion = await this.assistant.generate(
          { brief, validationFeedback: feedback },
          new AbortController().signal,
        );

        return {
          scenario: buildScenarioSeedFromSuggestion(code, suggestion, brief),
          authoringPrompt: brief,
        };
      } catch (error) {
        lastError = error;
        feedback = this.validationFeedback(error);
        this.logger.warn(
          `Scenario assistant attempt ${attempt}/${MAX_ASSISTANT_ATTEMPTS} failed validation or generation`,
        );
      }
    }

    if (lastError instanceof z.ZodError) {
      throw new AppServiceUnavailableException(
        ErrorCodes.SCENARIO_ASSISTANT_INVALID_DRAFT,
        "The assistant could not produce a valid scenario draft",
      );
    }

    throw new AppServiceUnavailableException(
      ErrorCodes.SCENARIO_ASSISTANT_UNAVAILABLE,
      "The scenario assistant is temporarily unavailable",
    );
  }

  async publish(
    request: PublishScenarioRequest,
    authorId: string,
  ): Promise<PublishedScenario> {
    try {
      return await this.repository.publish({
        scenario: request.scenario,
        authorId,
        authoringSource: request.authoringSource,
        authoringPrompt: request.authoringPrompt,
      });
    } catch (error) {
      if (error instanceof ScenarioAuthoringConflictError) {
        const personaConflict = error.conflict === "persona-code";

        throw new AppConflictException(
          personaConflict
            ? ErrorCodes.SCENARIO_PERSONA_CODE_EXISTS
            : ErrorCodes.SCENARIO_CODE_EXISTS,
          personaConflict
            ? "A caller persona with this code already exists"
            : "A scenario with this code already exists",
        );
      }

      throw error;
    }
  }

  private validationFeedback(error: unknown): string {
    if (error instanceof z.ZodError) {
      return error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
        .slice(0, 1_000);
    }

    return "Previous generation failed. Return one complete JSON object matching the schema.";
  }
}
