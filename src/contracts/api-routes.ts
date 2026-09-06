export const ApiRoutes = {
  Health: "health",
  Asr: "asr",
} as const;

export type ApiRouteName = (typeof ApiRoutes)[keyof typeof ApiRoutes];
