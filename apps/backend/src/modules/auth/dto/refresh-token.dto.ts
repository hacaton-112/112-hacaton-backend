import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { REFRESH_TOKEN_PATTERN } from "../domain/refresh-token";

/**
 * Shared by refresh and logout: both act on a refresh token and nothing else.
 * The pattern rejects junk before the database is touched.
 */
export const RefreshTokenSchema = z
  .object({
    refreshToken: z.string().regex(REFRESH_TOKEN_PATTERN),
  })
  .strict();

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
