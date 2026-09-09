export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
  Scenarios: "scenarios",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
