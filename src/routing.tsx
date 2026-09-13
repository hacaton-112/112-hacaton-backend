import { Flex, Spinner } from "@bolid-ui/themes";
import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router";

import { AppLayout } from "./layouts/app-layout";
import { AuthLayout } from "./layouts/auth-layout";
import { RoleLayout } from "./layouts/role-layout";
import AuthPage from "./pages/main/auth-page";
import DebriefPage from "./pages/main/debrief-page";
import OperatorPage from "./pages/main/operator-page";
import MapPage from "./pages/map/map-page";
import { withAppProviders, withMapWindowProviders } from "./providers";

const ScenarioConstructorPage = lazy(
  () => import("./pages/main/scenario-constructor-page"),
);

const scenarioConstructor = (
  <Suspense
    fallback={
      <Flex align="center" justify="center" className="h-full">
        <Spinner size="3" />
      </Flex>
    }
  >
    <ScenarioConstructorPage />
  </Suspense>
);

export function Routing() {
  return (
    <Routes>
      <Route element={withAppProviders(<Outlet />)}>
        <Route element={<AppLayout />}>
          <Route element={<AuthLayout />}>
            <Route index element={<OperatorPage />} />
            <Route path="/debrief" element={<DebriefPage />} />
            <Route
              path="/debrief/:trainingSessionId"
              element={<DebriefPage />}
            />
            <Route element={<RoleLayout allowed={["instructor", "admin"]} />}>
              <Route path="/scenarios/new" element={scenarioConstructor} />
            </Route>
          </Route>
          <Route path="/auth" element={<AuthPage />} />
        </Route>
      </Route>

      <Route element={withMapWindowProviders(<Outlet />)}>
        <Route path="/map" element={<MapPage />} />
      </Route>
    </Routes>
  );
}
