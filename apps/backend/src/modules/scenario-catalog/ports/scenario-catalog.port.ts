import type { ScenarioSummary } from "../dto/scenario-summary.dto";

/**
 * Каталог сценариев, доступных для тренировки.
 *
 * Отдельно от `ScenarioStore`: тот загружает правила уже начатого звонка, а
 * здесь только витрина, которую видит оператор перед выбором.
 */
export interface ScenarioCatalog {
  listPublished(): Promise<readonly ScenarioSummary[]>;
}

export const SCENARIO_CATALOG = Symbol("SCENARIO_CATALOG");
