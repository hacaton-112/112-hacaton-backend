export type ScenarioEngineErrorCode =
  | "scenario-version-not-published"
  | "scenario-version-not-found"
  | "call-already-started"
  | "call-not-active"
  | "call-stage-forbidden";

/**
 * Доменная ошибка движка.
 *
 * Транспорт переводит её в код API; сам движок не знает ни про HTTP, ни про
 * WebSocket и не должен зависеть от их словаря ошибок.
 */
export class ScenarioEngineError extends Error {
  constructor(
    readonly code: ScenarioEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScenarioEngineError";
  }
}
