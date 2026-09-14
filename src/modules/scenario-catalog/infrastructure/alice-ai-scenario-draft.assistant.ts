import { Injectable } from "@nestjs/common";

import { AliceAiStructuredOutputClient } from "@/modules/ai-gateway/adapters/alice-ai/alice-ai-structured-output.client";

import {
  scenarioAssistantJsonSchema,
  ScenarioAssistantSuggestionSchema,
} from "../domain/scenario-assistant-suggestion";
import type {
  ScenarioDraftAssistantPort,
  ScenarioDraftAssistantRequest,
} from "../ports/scenario-draft-assistant.port";

const SYSTEM_PROMPT = [
  "Ты помогаешь преподавателю подготовить синтетический учебный сценарий для оператора Системы-112.",
  "Верни только JSON по переданной схеме, без markdown и рассуждений.",
  "Не используй реальные персональные данные: имена, номера и адреса должны быть явно вымышленными учебными данными.",
  "Сформируй 4–10 атомарных фактов: один факт — одна проверяемая подробность.",
  "Ключи фактов пиши латиницей; mandatoryQuestions должны ссылаться только на существующие ключи.",
  "Первая реплика должна быть короткой и естественной, fallbackLine не должна раскрывать скрытые факты.",
  "contentKeywords — начала русских слов, по которым слышно содержание факта; questionKeywords — слова вопроса оператора.",
  "AI создаёт только черновик. Публикацию и окончательную проверку выполняет преподаватель.",
].join(" ");

@Injectable()
export class AliceAiScenarioDraftAssistant implements ScenarioDraftAssistantPort {
  constructor(private readonly client: AliceAiStructuredOutputClient) {}

  async generate(
    request: ScenarioDraftAssistantRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    const raw = await this.client.complete({
      schemaName: "scenario_draft",
      schemaDescription: "Editable synthetic System-112 training scenario",
      schema: scenarioAssistantJsonSchema(),
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        brief: request.brief,
        validationFeedback: request.validationFeedback ?? null,
      }),
      maxTokens: 4_096,
      signal,
    });

    return ScenarioAssistantSuggestionSchema.parse(raw);
  }
}
