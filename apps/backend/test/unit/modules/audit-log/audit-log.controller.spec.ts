import { AuditLogController } from "@/modules/audit-log/audit-log.controller";
import type { AuditLogQueryService } from "@/modules/audit-log/application/audit-log-query.service";

describe(AuditLogController.name, () => {
  it("передаёт проверенный запрос сервису", async () => {
    const service = {
      search: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    };
    const controller = new AuditLogController(
      service as unknown as AuditLogQueryService,
    );
    const query = { limit: 20, offset: 0 };

    await controller.search(query);

    expect(service.search).toHaveBeenCalledWith(query);
  });
});
