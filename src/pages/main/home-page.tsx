import { Navigate, useSearchParams } from "react-router";

import {
  ROUTES,
  ASSIGNMENT_QUERY_PARAM,
  SCENARIO_QUERY_PARAM,
  WORKPLACE_QUERY_PARAM,
} from "../../config/routes";
import { useAuthStore } from "../../stores/auth.store";

/**
 * Корень остаётся совместимым со старыми ссылками, но рабочее место имеет
 * собственный понятный URL. Обычный вход обучающегося ведёт в назначения.
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

  const query = search.toString();
  return (
    <Navigate to={`${ROUTES.operator()}${query ? `?${query}` : ""}`} replace />
  );
}
