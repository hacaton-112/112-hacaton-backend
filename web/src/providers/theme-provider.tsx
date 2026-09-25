import type { ReactNode } from "react";

import { ThemeWithPanel } from "../components/theme-with-panel";

export const themeProvider = (component: ReactNode) => (
  <ThemeWithPanel>{component}</ThemeWithPanel>
);
