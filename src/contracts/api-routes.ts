export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
  Auth: "auth",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
