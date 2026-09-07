import { z } from "zod";

import { UserIdSchema, UserRoleSchema } from "./auth-fields";

/** Claims the service signs; `iat`/`exp` are added by `JwtService`. */
export const JwtPayloadSchema = z
  .object({
    sub: UserIdSchema,
    email: z.email(),
    role: UserRoleSchema,
  })
  .strict();

export const VerifiedJwtPayloadSchema = JwtPayloadSchema.extend({
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
export type VerifiedJwtPayload = z.infer<typeof VerifiedJwtPayloadSchema>;
