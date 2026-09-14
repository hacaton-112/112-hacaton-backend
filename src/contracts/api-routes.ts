export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
  Geocoding: "geocoding",
  Scenarios: "scenarios",
  Calls: "calls",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
