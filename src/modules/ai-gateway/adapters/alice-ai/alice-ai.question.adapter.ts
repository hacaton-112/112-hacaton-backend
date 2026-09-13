import { Inject, Injectable, Logger } from "@nestjs/common";

import type { UnderstandQuestionRequest } from "@/contracts";
import type { QuestionUnderstandingPort } from "@/modules/ai-gateway/ports/question-understanding.port";

import type { AliceAiConfig } from "./alice-ai.config";
import { AliceAiError } from "./alice-ai.error";
import {
  buildAliceAiQuestionRequest,
  parseAliceAiQuestionResponse,
} from "./alice-ai.question";
import {
  ALICE_AI_CONFIG,
  ALICE_AI_FETCH,
  type AliceAiFetch,
} from "./alice-ai.tokens";

/**
 * Разбор вопроса стоит оператору ожидания перед ответом заявителя, поэтому у
 * него свой срок, короче общего: лучше разобрать вопрос по словам сценария, чем
 * заставить оператора ждать модель.
 */
const QUESTION_TIMEOUT_MS = 2_500;

@Injectable()
export class AliceAiQuestionAdapter implements QuestionUnderstandingPort {
  private readonly logger = new Logger(AliceAiQuestionAdapter.name);

  constructor(
    @Inject(ALICE_AI_CONFIG) private readonly config: AliceAiConfig,
    @Inject(ALICE_AI_FETCH)
    private readonly fetchImplementation: AliceAiFetch,
  ) {}

  async understand(
    request: UnderstandQuestionRequest,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    signal.throwIfAborted();

    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(QUESTION_TIMEOUT_MS),
    ]);
    const started = performance.now();
    const response = await this.fetchImplementation(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Project": this.config.folderId,
        },
        body: JSON.stringify(buildAliceAiQuestionRequest(request, this.config)),
        signal: requestSignal,
      },
    );

    if (!response.ok) {
      throw new AliceAiError(
        "http-error",
        `Alice AI question request failed with status ${response.status}`,
        { status: response.status, retryable: response.status >= 500 },
      );
    }

    const asked = parseAliceAiQuestionResponse(await response.json(), request);

    this.logger.debug(
      `Understood «${request.operatorText}» as ${
        asked.join(", ") || "no fact of this scenario"
      } in ${Math.round(performance.now() - started)} ms`,
    );

    return asked;
  }
}
