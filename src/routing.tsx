import { Flex, Spinner } from "@bolid-ui/themes";
import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router";

import { ROUTE_PATTERNS } from "./config/routes";
import { SCENARIO_AUTHOR_ROLES } from "./config/roles";
import { AppLayout } from "./layouts/app-layout";
import { AuthLayout } from "./layouts/auth-layout";
import { RoleLayout } from "./layouts/role-layout";
import AuthPage from "./pages/main/auth-page";
import DebriefPage from "./pages/main/debrief-page";
import DdsExercisePage from "./pages/main/dds-exercise-page";
import OperatorPage from "./pages/main/operator-page";
import MapPage from "./pages/map/map-page";
import { withAppProviders, withMapWindowProviders } from "./providers";

const ScenarioConstructorPage = lazy(
  () => import("./pages/main/scenario-constructor-page"),
);
const ScenarioCatalogPage = lazy(
  () => import("./pages/main/scenario-catalog-page"),
);

const pageFallback = (
  <Flex align="center" justify="center" className="h-full">
    <Spinner size="3" />
  </Flex>
);

const scenarioConstructor = (
  <Suspense fallback={pageFallback}>
    <ScenarioConstructorPage />
  </Suspense>
);

const scenarioCatalog = (
  <Suspense fallback={pageFallback}>
    <ScenarioCatalogPage />
  </Suspense>
);

export function Routing() {
  return (
    <Routes>
      <Route element={withAppProviders(<Outlet />)}>
        <Route element={<AppLayout />}>
          <Route element={<AuthLayout />}>
            <Route index element={<OperatorPage />} />
            <Route path={ROUTE_PATTERNS.debrief} element={<DebriefPage />} />
            <Route
              path={ROUTE_PATTERNS.debriefSession}
              element={<DebriefPage />}
            />
            <Route element={<RoleLayout allowed={["operator"]} />}>
              <Route path={ROUTE_PATTERNS.dds} element={<DdsExercisePage />} />
            </Route>
            <Route element={<RoleLayout allowed={SCENARIO_AUTHOR_ROLES} />}>
              <Route
                path={ROUTE_PATTERNS.scenarios}
                element={scenarioCatalog}
              />
              <Route
                path={ROUTE_PATTERNS.scenarioNew}
                element={scenarioConstructor}
              />
              <Route
                path={ROUTE_PATTERNS.scenarioEdit}
                element={scenarioConstructor}
              />
            </Route>
          </Route>
          <Route path={ROUTE_PATTERNS.auth} element={<AuthPage />} />
        </Route>
      </Route>

      <Route element={withMapWindowProviders(<Outlet />)}>
        <Route path={ROUTE_PATTERNS.map} element={<MapPage />} />
      </Route>
    </Routes>
  );
}
