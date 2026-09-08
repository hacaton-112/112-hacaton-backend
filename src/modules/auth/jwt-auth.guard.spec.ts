import type { ExecutionContext } from "@nestjs/common";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { AccessTokenVerifier } from "./access-token.verifier";
import { JwtAuthGuard } from "./jwt-auth.guard";

interface RequestStub {
  headers: { authorization?: string };
  user?: unknown;
}

const createContext = (request: RequestStub): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const createGuard = (
  verify: jest.Mock,
): { guard: JwtAuthGuard; verify: jest.Mock } => {
  const accessTokenVerifier = {
    verify,
  } as unknown as AccessTokenVerifier;

  return { guard: new JwtAuthGuard(accessTokenVerifier), verify };
};

const validPayload = {
  sub: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
  email: "operator@example.test",
  role: "operator",
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

describe(JwtAuthGuard.name, () => {
  it("attaches the verified payload to the request", async () => {
    const request: RequestStub = { headers: { authorization: "Bearer token" } };
    const { guard, verify } = createGuard(
      jest.fn().mockResolvedValue(validPayload),
    );

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.user).toEqual(validPayload);
    expect(verify).toHaveBeenCalledWith("Bearer token");
  });

  it("rejects the request when verification returns no user", async () => {
    const request: RequestStub = { headers: {} };
    const { guard } = createGuard(jest.fn().mockResolvedValue(null));

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(AppUnauthorizedException);

    expect(request.user).toBeUndefined();
  });

  it("reports the rejection with the coded error the frontend expects", async () => {
    const { guard } = createGuard(jest.fn().mockResolvedValue(null));

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: "Bearer token" } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH_TOKEN_INVALID });
  });
});
