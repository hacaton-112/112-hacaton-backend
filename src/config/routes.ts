/**
 * Маршруты приложения — по образцу `config/api.ts`, где так же собраны адреса
 * backend.
 *
 * Шаблоны (`*_PATTERN`) объявляют маршрут в `routing.tsx`, функции строят
 * адрес для перехода. Пока путь писался литералом и в дереве роутов, и в
 * каждой кнопке, переименование маршрута означало правку в девяти местах.
 */

/** Шаблоны для `<Route path>`: только здесь встречаются `:параметры`. */
export const ROUTE_PATTERNS = {
  operator: "/",
  auth: "/auth",
  debrief: "/debrief",
  debriefSession: "/debrief/:trainingSessionId",
  scenarios: "/scenarios",
  scenarioNew: "/scenarios/new",
  scenarioEdit: "/scenarios/:scenarioVersionId/edit",
  map: "/map",
} as const;

export const ROUTES = {
  operator: () => "/",
  auth: () => "/auth",
  debrief: () => "/debrief",
  debriefSession: (trainingSessionId: string) =>
    `/debrief/${encodeURIComponent(trainingSessionId)}`,
  scenarios: () => "/scenarios",
  scenarioNew: () => "/scenarios/new",
  scenarioEdit: (scenarioVersionId: string) =>
    `/scenarios/${encodeURIComponent(scenarioVersionId)}/edit`,
  /** Рабочее место с уже выбранным сценарием: брифинг открывает звонок так. */
  operatorWithScenario: (scenarioVersionId: string) =>
    `/?scenario=${encodeURIComponent(scenarioVersionId)}`,
} as const;

/** Имя параметра, которым брифинг передаёт сценарий на рабочее место. */
export const SCENARIO_QUERY_PARAM = "scenario";

/**
 * Окно карты. В Tauri оно уже создано и адресуется меткой из `tauri.conf.json`;
 * в браузере его заменяет вкладка по hash-адресу того же маршрута.
 */
export const MAP_WINDOW_LABEL = "incident-map";
export const MAP_WINDOW_URL = `/#${ROUTE_PATTERNS.map}`;
