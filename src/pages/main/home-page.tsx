import { Navigate, useSearchParams } from "react-router";

import OperatorPage from "./operator-page";
import {
  ROUTES,
  ASSIGNMENT_QUERY_PARAM,
  SCENARIO_QUERY_PARAM,
  WORKPLACE_QUERY_PARAM,
} from "../../config/routes";
import { useAuthStore } from "../../stores/auth.store";

/**
 * Прямые ссылки на голосовой сценарий остаются рабочим местом оператора.
 * Обычный вход обучающегося ведёт в назначения, где тип занятия уже определён
 * преподавателем и не требует знания внутренней структуры программы.
 */
export default function HomePage() {
  const role = useAuthStore((state) => state.user?.role);
  const [search] = useSearchParams();
  const opensVoiceAssignment =
    search.has(SCENARIO_QUERY_PARAM) || search.has(ASSIGNMENT_QUERY_PARAM);
  const opensWorkplace =
    opensVoiceAssignment || search.has(WORKPLACE_QUERY_PARAM);

  if (role === "operator" && !opensWorkplace) {
    return <Navigate to={ROUTES.assignments()} replace />;
  }

  return <OperatorPage />;
}
