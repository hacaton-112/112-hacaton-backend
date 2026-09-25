import type { DrizzleService } from "@/core/database/drizzle.service";
import { DrizzleAuditLogRepository } from "@/modules/audit-log/infrastructure/drizzle-audit-log.repository";

describe(DrizzleAuditLogRepository.name, () => {
  it("возвращает имя и email автора вместе с общей численностью", async () => {
    const rows = [
      {
        id: "audit-1",
        actorId: "actor-1",
        actorName: "Администратор",
        actorEmail: "admin@example.test",
        action: "auth.login.failed",
        resource: "auth-session",
        resourceId: null,
        sessionId: null,
        details: { reason: "wrong_password" },
        ipAddress: "10.0.0.5",
        createdAt: new Date("2026-09-25T10:00:00.000Z"),
      },
    ];
    const listBuilder = {
      from: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      offset: jest.fn().mockResolvedValue(rows),
    };
    listBuilder.from.mockReturnValue(listBuilder);
    listBuilder.leftJoin.mockReturnValue(listBuilder);
    listBuilder.where.mockReturnValue(listBuilder);
    listBuilder.orderBy.mockReturnValue(listBuilder);
    listBuilder.limit.mockReturnValue(listBuilder);
    const countBuilder = {
      from: jest.fn(),
      where: jest.fn().mockResolvedValue([{ total: 7 }]),
    };
    countBuilder.from.mockReturnValue(countBuilder);
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(listBuilder)
        .mockReturnValueOnce(countBuilder),
    } as unknown as DrizzleService["db"];
    const repository = new DrizzleAuditLogRepository(db);

    const page = await repository.search({ limit: 20, offset: 0 });

    expect(page).toEqual({
      items: [
        {
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
        },
      ],
      total: 7,
      limit: 20,
      offset: 0,
    });
    expect(listBuilder.orderBy).toHaveBeenCalledTimes(1);
  });
});
