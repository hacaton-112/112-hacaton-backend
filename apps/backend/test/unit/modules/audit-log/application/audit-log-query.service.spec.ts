import { AuditLogQueryService } from "@/modules/audit-log/application/audit-log-query.service";
import type { AuditLogRepository } from "@/modules/audit-log/ports/audit-log.repository";

describe(AuditLogQueryService.name, () => {
  it("передаёт все фильтры в репозиторий", async () => {
    const repository = {
      search: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    };
    const service = new AuditLogQueryService(
      repository as unknown as AuditLogRepository,
    );
    const query = {
      from: "2026-09-01",
      to: "2026-09-30",
      action: "auth.login.failed",
      hasError: true,
      limit: 20,
      offset: 0,
    };

    await service.search(query);

    expect(repository.search).toHaveBeenCalledWith(query);
  });
});
