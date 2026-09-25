import { Inject, Injectable } from "@nestjs/common";

import {
  STRUCTURED_OUTPUT_PORT,
  type StructuredOutputPort,
} from "@/modules/ai-gateway/ports/structured-output.port";

import {
  scenarioAssistantJsonSchema,
  ScenarioAssistantSuggestionSchema,
} from "../domain/scenario-assistant-suggestion";
import type {
  ScenarioDraftAssistantPort,
  ScenarioDraftAssistantRequest,
} from "../ports/scenario-draft-assistant.port";

const SYSTEM_PROMPT = [
  "Ты помогаешь преподавателю подготовить синтетический учебный вызов для тренажёра Системы-112.",
  "Верни только JSON по переданной схеме, без markdown и рассуждений. Пиши коротко: это вводная, а не рассказ.",
  "situation — 1–3 предложения: что случилось и что видит заявитель.",
  "details — до 5 коротких подробностей, которые заявитель скажет на вопрос оператора (приметы, номер машины, этаж, что уже сделано).",
  "Не используй реальные персональные данные: имя заявителя явно вымышленное учебное.",
  "Не придумывай адреса, номера домов, квартир, подъездов и координаты: место преподаватель задаёт на карте после генерации.",
  "victims — число пострадавших; null, если заявитель не знает.",
  "openingLine — первые слова заявителя после ответа оператора: он сообщает о происшествии или просит о помощи. Никогда не пиши в ней приветствие службы 112, вопросы или инструкции оператора.",
  "Если brief содержит явный список «Службы:», services должен содержать только перечисленные там службы; ГИБДД и ДПС относятся к police.",
  "AI создаёт только черновик. Публикацию и окончательную проверку выполняет преподаватель.",
].join(" ");

@Injectable()
export class StructuredOutputScenarioDraftAssistant
  implements ScenarioDraftAssistantPort
{
  constructor(
    @Inject(STRUCTURED_OUTPUT_PORT)
    private readonly client: StructuredOutputPort,
  ) {}

  async generate(
    request: ScenarioDraftAssistantRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    const raw = await this.client.complete({
      schemaName: "scenario_draft",
      schemaDescription:
        "Editable synthetic System-112 training scenario without instructor-owned location data",
      schema: scenarioAssistantJsonSchema(),
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        brief: request.brief,
        validationFeedback: request.validationFeedback ?? null,
      }),
      // Вводная укладывается в пару сотен токенов; запас — на русский текст.
      maxTokens: 700,
      signal,
    });

    return ScenarioAssistantSuggestionSchema.parse(raw);
  }
}
