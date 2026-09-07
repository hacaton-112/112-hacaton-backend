import { Route, Routes } from "react-router";

import { RequireAuth } from "./components/auth/require-auth";
import { VoiceTrainer } from "./components/voice-trainer";
import { AppLayout } from "./layouts/app-layout";
import AuthPage from "./pages/auth-page";

export function Routing() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/"
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
