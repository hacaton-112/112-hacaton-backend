export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
  Geocoding: "geocoding",
  Scenarios: "scenarios",
  Calls: "calls",
  DdsExercises: "dds-exercises",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
