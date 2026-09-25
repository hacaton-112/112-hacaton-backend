import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "@/drizzle/schema";

export const ROLES_METADATA_KEY = "allowed-roles";

/** Roles are transport authorization, not a Scenario Engine decision. */
export const Roles = (...roles: readonly UserRole[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
