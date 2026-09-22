import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import {
  AppConflictException,
  AppNotFoundException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { GrammarService, type GrammarReport } from "@/modules/grammar";
import { ErrorCodes } from "@/contracts";

import { buildScenarioDraftFromSuggestion } from "../domain/scenario-assistant-suggestion";
import { scenarioTexts } from "../domain/scenario-texts";
import type {
  GenerateScenarioDraftResponse,
  PublishScenarioRequest,
  PublishScenarioVersionRequest,
} from "../dto/scenario-authoring.dto";
import {
  type EditableScenarioVersion,
  SCENARIO_AUTHORING_REPOSITORY,
  ScenarioAuthoringConflictError,
  type PublishedScenario,
  type ScenarioAuthoringRepository,
  ScenarioNotFoundError,
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
    private readonly grammar: GrammarService,
  ) {}

  /**
   * Проверяет тексты сценария по просьбе преподавателя.
   *
   * Ничего не сохраняет и не мешает публикации: это подсказка автору, а не
   * новое условие. Черновик читается как есть, даже если он ещё не сходится
   * со схемой.
   */
  checkGrammar(
    scenario: unknown,
    deepReview = false,
    signal?: AbortSignal,
  ): Promise<GrammarReport> {
    return this.grammar.check(scenarioTexts(scenario), { deepReview, signal });
  }

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
          scenario: buildScenarioDraftFromSuggestion(code, suggestion, brief),
          authoringPrompt: brief,
        };
      } catch (error) {
        lastError = error;
        feedback = this.validationFeedback(error);
        // Причина в журнале: без неё по «failed validation» нельзя понять,
        // какое поле модель заполняет неверно.
        this.logger.warn(
          `Scenario assistant attempt ${attempt}/${MAX_ASSISTANT_ATTEMPTS} failed: ${feedback}`,
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
        preparationId: request.preparationId,
        scenario: request.scenario,
        authorId,
        authoringSource: request.authoringSource,
        authoringPrompt: request.authoringPrompt,
      });
    } catch (error) {
      throw this.toAppError(error);
    }
  }

  /** Опубликованная версия целиком — чтобы открыть её в конструкторе. */
  async loadVersion(
    scenarioVersionId: string,
  ): Promise<EditableScenarioVersion> {
    const version = await this.repository.loadVersion(scenarioVersionId);

    if (version === null) {
      throw new AppNotFoundException(
        ErrorCodes.SCENARIO_VERSION_NOT_FOUND,
        "There is no published scenario version with this id",
      );
    }

    return version;
  }

  /**
   * Правка публикуется новой неизменяемой версией.
   *
   * Прошлые версии остаются как были: на них ссылаются проведённые звонки, и
   * разбор занятия обязан показывать сценарий таким, каким его проходили.
   */
  async publishVersion(
    scenarioId: string,
    request: PublishScenarioVersionRequest,
    authorId: string,
  ): Promise<PublishedScenario> {
    try {
      return await this.repository.publishVersion({
        preparationId: request.preparationId,
        scenarioId,
        baseVersionId: request.baseVersionId,
        scenario: request.scenario,
        authorId,
        authoringSource: request.authoringSource,
        authoringPrompt: request.authoringPrompt,
      });
    } catch (error) {
      throw this.toAppError(error);
    }
  }

  /**
   * Удаляет сценарий из каталога.
   *
   * Физически версии не удаляются: на них ссылаются проведённые звонки, и
   * разбор занятия обязан открываться и после удаления сценария. Сценарий
   * пропадает из каталога, новый звонок по нему не начать, а повторное
   * удаление ничего не меняет.
   */
  async archive(scenarioId: string, actorId: string): Promise<void> {
    try {
      await this.repository.archive({ scenarioId, actorId });
    } catch (error) {
      throw this.toAppError(error);
    }
  }

  private toAppError(error: unknown): unknown {
    if (error instanceof ScenarioNotFoundError) {
      return new AppNotFoundException(
        ErrorCodes.SCENARIO_NOT_FOUND,
        "The scenario does not exist",
      );
    }

    if (!(error instanceof ScenarioAuthoringConflictError)) {
      return error;
    }

    switch (error.conflict) {
      case "scenario-code":
        return new AppConflictException(
          ErrorCodes.SCENARIO_CODE_EXISTS,
          "A scenario with this code already exists",
        );
      case "persona-code":
        return new AppConflictException(
          ErrorCodes.SCENARIO_PERSONA_CODE_EXISTS,
          "A caller persona with this code already exists",
        );
      case "code-changed":
        return new AppConflictException(
          ErrorCodes.SCENARIO_CODE_IMMUTABLE,
          "An edit cannot change the scenario code",
        );
      case "stale-version":
        return new AppConflictException(
          ErrorCodes.SCENARIO_VERSION_STALE,
          "A newer version of this scenario has been published since the edit began",
        );
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
