import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    sessionId: text("session_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_log_actor_id_idx").on(table.actorId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_resource_idx").on(table.resource),
    index("audit_log_session_id_idx").on(table.sessionId),
    index("audit_log_created_at_idx").on(table.createdAt),
  ],
);
