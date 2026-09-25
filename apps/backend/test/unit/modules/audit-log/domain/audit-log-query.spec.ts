import {
  auditEntryHasError,
  auditLogPeriod,
} from "@/modules/audit-log/domain/audit-log-query";

describe("запрос журнала аудита", () => {
  it("включает обе календарные границы периода", () => {
    expect(auditLogPeriod("2026-09-01", "2026-09-30")).toEqual({
      since: new Date("2026-09-01T00:00:00.000Z"),
      until: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  it("отклоняет период с обратными границами", () => {
    expect(() => auditLogPeriod("2026-10-01", "2026-09-30")).toThrow(
      RangeError,
    );
  });

  it("распознаёт ошибку по действию и служебным полям", () => {
    expect(auditEntryHasError("auth.login.failed", null)).toBe(true);
    expect(auditEntryHasError("job.completed", { errorCode: "TIMEOUT" })).toBe(
      true,
    );
    expect(auditEntryHasError("auth.login.succeeded", null)).toBe(false);
  });
});
