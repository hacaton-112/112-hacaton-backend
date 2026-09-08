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

/**
 * Unknown keys are tolerated on purpose: registered claims such as `iss`,
 * `aud`, `jti` or `nbf` may be added to signing later, and a strict shape here
 * would reject every token the service itself issues.
 */
export const VerifiedJwtPayloadSchema = JwtPayloadSchema.extend({
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
}).loose();

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
export type VerifiedJwtPayload = z.infer<typeof VerifiedJwtPayloadSchema>;
