import type { UnderstandQuestionRequest } from "@/contracts";

/**
 * Что оператор спросил.
 *
 * Отдельный порт, а не метод `LlmPort`: там модель играет заявителя и пишет
 * реплику, здесь — отвечает на служебный вопрос движка о закрытом списке
 * фактов. Задачи разные, и провайдеры у них могут быть разными.
 */
export interface QuestionUnderstandingPort {
  /**
   * Возвращает идентификаторы фактов, о которых спросил оператор. Пустой
   * массив — спросил о том, чего в сценарии нет.
   */
  understand(
    request: UnderstandQuestionRequest,
    signal: AbortSignal,
  ): Promise<readonly string[]>;
}

export const QUESTION_UNDERSTANDING_PORT = Symbol(
  "QUESTION_UNDERSTANDING_PORT",
);
