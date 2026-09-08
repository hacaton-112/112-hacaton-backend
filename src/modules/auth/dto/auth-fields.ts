import { z } from "zod";

import { USER_ROLES } from "@/drizzle/schema";

export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_FULL_NAME_LENGTH = 2;
export const MAX_FULL_NAME_LENGTH = 120;

/**
 * Derived from the database enum rather than repeated here: two lists of roles
 * would eventually disagree, and the one Postgres enforces has to win.
 */
export const UserRoleSchema = z.enum(USER_ROLES);

export const UserIdSchema = z.uuid();

/** Normalises before validating: stored emails are always trimmed and lowercased. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(MAX_EMAIL_LENGTH));

export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .max(MAX_PASSWORD_LENGTH)
  .refine((password) => /[A-Za-z]/.test(password), {
    message: "Password must contain at least one letter",
  })
  .refine((password) => /\d/.test(password), {
    message: "Password must contain at least one digit",
  });

export const FullNameSchema = z
  .string()
  .trim()
  .min(MIN_FULL_NAME_LENGTH)
  .max(MAX_FULL_NAME_LENGTH);

export type UserRole = z.infer<typeof UserRoleSchema>;
