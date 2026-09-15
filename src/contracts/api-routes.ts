export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
  Geocoding: "geocoding",
  Scenarios: "scenarios",
  Calls: "calls",
  Groups: "groups",
  Assignments: "assignments",
  Instructor: "instructor",
  Users: "users",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
