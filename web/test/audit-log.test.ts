import { describe, expect, test } from "bun:test";

import {
  auditActionLabel,
  auditResourceLabel,
} from "../src/components/admin/audit-log-formatters";
import { ROUTES } from "../src/config/routes";
import { AuditLogPageSchema } from "../src/contracts/audit-log";

const entry = {
  id: "audit-1",
  actor: {
    id: "actor-1",
    fullName: "Администратор",
    email: "admin@example.test",
  },
  action: "auth.login.failed",
  resource: "auth-session",
  resourceId: null,
  sessionId: null,
  details: { reason: "wrong_password" },
  ipAddress: "10.0.0.5",
  createdAt: "2026-09-25T10:00:00.000Z",
  hasError: true,
};

describe("журнал аудита", () => {
  test("принимает страницу API с читаемым автором", () => {
    const page = AuditLogPageSchema.parse({
      items: [entry],
      total: 1,
      limit: 20,
      offset: 0,
    });

    expect(page.items[0]?.actor?.email).toBe("admin@example.test");
  });

  test("показывает русские подписи вместо технических кодов", () => {
    expect(auditActionLabel("auth.login.failed")).toBe(
      "Неудачная попытка входа",
    );
    expect(auditActionLabel("future.action")).toBe("Системное действие");
    expect(auditResourceLabel("auth-session")).toBe("Сессия");
  });

  test("имеет отдельный маршрут администратора", () => {
    expect(ROUTES.auditLog()).toBe("/admin/audit-log");
  });
});
