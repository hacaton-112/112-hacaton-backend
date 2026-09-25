import { AuditLogQuerySchema } from "@/modules/audit-log/dto/audit-log.dto";

describe("параметры чтения журнала аудита", () => {
  it("преобразует HTTP-параметры и задаёт страницу по умолчанию", () => {
    expect(
      AuditLogQuerySchema.parse({ hasError: "false", limit: "50" }),
    ).toEqual({ hasError: false, limit: 50, offset: 0 });
  });

  it("не принимает неизвестные параметры", () => {
    expect(() => AuditLogQuerySchema.parse({ export: "csv" })).toThrow();
  });
});
