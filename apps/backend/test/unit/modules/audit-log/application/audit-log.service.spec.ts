import type { DrizzleService } from "@/core/database/drizzle.service";
import { auditLog } from "@/drizzle/schema";

import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

describe(AuditLogService.name, () => {
  it("stores a session-scoped event with structured details", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });
    const db = { insert } as unknown as DrizzleService["db"];
    const service = new AuditLogService(db);
    const details = { previousState: "incoming", nextState: "active" };

    await service.log({
      actorId: "instructor-1",
      action: "session.accept_call",
      resource: "training-session",
      resourceId: "session-1",
      sessionId: "session-1",
      details,
    });

    expect(insert).toHaveBeenCalledWith(auditLog);
    expect(values).toHaveBeenCalledWith({
      id: expect.any(String),
      actorId: "instructor-1",
      action: "session.accept_call",
      resource: "training-session",
      resourceId: "session-1",
      sessionId: "session-1",
      details,
      ipAddress: null,
    });
  });
});
