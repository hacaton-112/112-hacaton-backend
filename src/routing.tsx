import { Route, Routes } from "react-router";

import { RequireAuth } from "./components/auth/require-auth";
import { VoiceTrainer } from "./components/voice-trainer";
import { AppLayout } from "./layouts/app-layout";
import AuthPage from "./pages/auth-page";
import OperatorPage from "./pages/operator-page";

export function Routing() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={
            <RequireAuth>
              <OperatorPage />
            </RequireAuth>
          }
        />
        {/* Отладочный стенд голосового контура, пока он не встроен в АРМ. */}
        <Route
          path="/trainer"
          element={
            <RequireAuth>
              <VoiceTrainer />
            </RequireAuth>
          }
        />
        <Route path="/auth" element={<AuthPage />} />
      </Route>
    </Routes>
  );
}
