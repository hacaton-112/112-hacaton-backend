import { Outlet, Route, Routes } from "react-router";

import { RequireAuth } from "./components/auth/require-auth";
import { AppLayout } from "./layouts/app-layout";
import AuthPage from "./pages/main/auth-page";
import OperatorPage from "./pages/main/operator-page";
import MapPage from "./pages/map/map-page";
import { withAppProviders, withMapWindowProviders } from "./providers";

export function Routing() {
  return (
    <Routes>
      <Route element={withAppProviders(<Outlet />)}>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <RequireAuth>
                <OperatorPage />
              </RequireAuth>
            }
          />
          <Route path="/auth" element={<AuthPage />} />
        </Route>
      </Route>

      <Route element={withMapWindowProviders(<Outlet />)}>
        <Route path="/map" element={<MapPage />} />
      </Route>
    </Routes>
  );
}
