export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
  Geocoding: "geocoding",
  Scenarios: "scenarios",
  Calls: "calls",
  Classifiers: "classifiers",
  DdsExercises: "dds-exercises",
  Groups: "groups",
  Assignments: "assignments",
  Instructor: "instructor",
  Users: "users",
  MethodicalMaterials: "methodical-materials",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
