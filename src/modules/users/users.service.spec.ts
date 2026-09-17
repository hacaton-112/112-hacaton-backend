jest.mock("@/core/config/env.config", () => ({
  env: { JWT_ACCESS_TTL_SECONDS: 3_600 },
}));

import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { AuditLogService } from "@/modules/audit-log/audit-log.service";
import type { AuthService } from "@/modules/auth/auth.service";

import { UsersService } from "./users.service";

const actorId = "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f";
const otherId = "52a2fb62-356f-49c0-a621-882af11e45c8";
const user = {
  id: otherId,
  email: "operator@example.test",
  fullName: "Иван Иванов",
  role: "operator" as const,
  isActive: true,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const createService = () => {
  const auth = {
    createUser: jest.fn().mockResolvedValue(user),
    listUsers: jest.fn().mockResolvedValue([user]),
    updateUser: jest.fn().mockResolvedValue(user),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new UsersService(
      auth as unknown as AuthService,
      audit as unknown as AuditLogService,
    ),
    auth,
    audit,
  };
};

const codeOf = async (action: () => Promise<unknown>): Promise<string> => {
  try {
    await action();
  } catch (error) {
    return error instanceof AppException ? error.code : "unknown";
  }
  return "none";
};

describe(UsersService.name, () => {
  it("forwards explicit list filters", async () => {
    const { service, auth } = createService();
    const filters = {
      role: "operator" as const,
      status: "inactive" as const,
      search: "иванов",
    };

    await service.list(filters);

    expect(auth.listUsers).toHaveBeenCalledWith(filters);
  });

  it("does not let an administrator deactivate themselves", async () => {
    const { service, auth } = createService();

    await expect(
      codeOf(() => service.update(actorId, actorId, { isActive: false })),
    ).resolves.toBe(ErrorCodes.AUTH_ROLE_FORBIDDEN);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("audits deactivation without storing a password", async () => {
    const { service, audit } = createService();

    await service.update(actorId, otherId, {
      isActive: false,
      password: "NewPassword1",
    });

    expect(audit.log).toHaveBeenCalledWith({
      actorId,
      action: "user.deactivated",
      resource: "user",
      resourceId: otherId,
      details: {
        fields: ["isActive"],
        passwordChanged: true,
      },
    });
  });
});
