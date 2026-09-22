import { Flex, Spinner } from "@bolid-ui/themes";
import { lazy, Suspense, type ReactNode } from "react";
import { Outlet, Route, Routes } from "react-router";

import { ROUTE_PATTERNS } from "./config/routes";
import {
  ADMIN_ROLES,
  CLASSIFIER_VIEWER_ROLES,
  DDS_TRAINEE_ROLES,
  SCENARIO_AUTHOR_ROLES,
  TRAINEE_ROLES,
  TRAINING_MANAGER_ROLES,
} from "./config/roles";
import { AppLayout } from "./layouts/app-layout";
import { AuthLayout } from "./layouts/auth-layout";
import { RoleLayout } from "./layouts/role-layout";
import AuthPage from "./pages/main/auth-page";
import DebriefPage from "./pages/main/debrief-page";
import DdsExercisePage from "./pages/main/dds-exercise-page";
import HomePage from "./pages/main/home-page";
import OperatorPage from "./pages/main/operator-page";
import MapPage from "./pages/map/map-page";
import {
  withAppProviders,
  withMapWindowProviders,
  withPhoneWindowProviders,
} from "./providers";

const ScenarioConstructorPage = lazy(
  () => import("./pages/main/scenario-constructor-page"),
);
const ScenarioCatalogPage = lazy(
  () => import("./pages/main/scenario-catalog-page"),
);
const AssignmentsPage = lazy(() => import("./pages/main/assignments-page"));
const MonitoringPage = lazy(() => import("./pages/main/monitoring-page"));
const ReportsPage = lazy(() => import("./pages/main/reports-page"));
const GroupsPage = lazy(() => import("./pages/main/groups-page"));
const GroupPage = lazy(() => import("./pages/main/group-page"));
const StudentPage = lazy(() => import("./pages/main/student-page"));
const StudentsPage = lazy(() => import("./pages/main/students-page"));
const AdminPage = lazy(() => import("./pages/main/admin-page"));
const ClassifierPage = lazy(() => import("./pages/main/classifier-page"));
const MethodicalMaterialsPage = lazy(
  () => import("./pages/main/methodical-materials-page"),
);
const BrowserPhonePage = lazy(() => import("./pages/phone/browser-phone-page"));

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

const lazyPage = (page: ReactNode) => (
  <Suspense fallback={pageFallback}>{page}</Suspense>
);

export function Routing() {
  return (
    <Routes>
      <Route element={withAppProviders(<Outlet />)}>
        <Route element={<AppLayout />}>
          <Route element={<AuthLayout />}>
            <Route index element={<HomePage />} />
            <Route path={ROUTE_PATTERNS.operator} element={<OperatorPage />} />
            <Route path={ROUTE_PATTERNS.debrief} element={<DebriefPage />} />
            <Route
              path={ROUTE_PATTERNS.methodicalMaterials}
              element={lazyPage(<MethodicalMaterialsPage />)}
            />
            <Route
              path={ROUTE_PATTERNS.debriefSession}
              element={<DebriefPage />}
            />
            <Route element={<RoleLayout allowed={TRAINEE_ROLES} />}>
              <Route
                path={ROUTE_PATTERNS.assignments}
                element={lazyPage(<AssignmentsPage />)}
              />
            </Route>
            <Route element={<RoleLayout allowed={TRAINING_MANAGER_ROLES} />}>
              <Route
                path={ROUTE_PATTERNS.monitoring}
                element={lazyPage(<MonitoringPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.reports}
                element={lazyPage(<ReportsPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.groups}
                element={lazyPage(<GroupsPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.group}
                element={lazyPage(<GroupPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.groupStudent}
                element={lazyPage(<StudentPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.students}
                element={lazyPage(<StudentsPage />)}
              />
              <Route
                path={ROUTE_PATTERNS.student}
                element={lazyPage(<StudentPage />)}
              />
            </Route>
            <Route element={<RoleLayout allowed={DDS_TRAINEE_ROLES} />}>
              <Route path={ROUTE_PATTERNS.dds} element={<DdsExercisePage />} />
            </Route>
            <Route element={<RoleLayout allowed={CLASSIFIER_VIEWER_ROLES} />}>
              <Route
                path={ROUTE_PATTERNS.classifier}
                element={lazyPage(<ClassifierPage />)}
              />
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
            <Route element={<RoleLayout allowed={ADMIN_ROLES} />}>
              <Route
                path={ROUTE_PATTERNS.admin}
                element={lazyPage(<AdminPage />)}
              />
            </Route>
          </Route>
          <Route path={ROUTE_PATTERNS.auth} element={<AuthPage />} />
        </Route>
      </Route>

      <Route element={withMapWindowProviders(<Outlet />)}>
        <Route path={ROUTE_PATTERNS.map} element={<MapPage />} />
      </Route>
      <Route element={withPhoneWindowProviders(<Outlet />)}>
        <Route
          path={ROUTE_PATTERNS.phone}
          element={lazyPage(<BrowserPhonePage />)}
        />
      </Route>
    </Routes>
  );
}
