import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AppForbiddenException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import { ROLES_METADATA_KEY } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

class ControllerStub {}

const createContext = (
  handler: () => void,
  role?: "operator" | "instructor" | "admin",
) =>
  ({
    getHandler: () => handler,
    getClass: () => ControllerStub,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe(RolesGuard.name, () => {
  it("allows an instructor listed by the route", () => {
    const handler = () => undefined;
    const reflector = new Reflector();
    Reflect.defineMetadata(
      ROLES_METADATA_KEY,
      ["instructor", "admin"],
      handler,
    );
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(handler, "instructor"))).toBe(true);
  });

  it("rejects an operator with a stable error code", () => {
    const handler = () => undefined;
    const reflector = new Reflector();
    Reflect.defineMetadata(
      ROLES_METADATA_KEY,
      ["instructor", "admin"],
      handler,
    );
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(handler, "operator"))).toThrow(
      AppForbiddenException,
    );

    try {
      guard.canActivate(createContext(handler, "operator"));
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCodes.AUTH_ROLE_FORBIDDEN });
    }
  });

  it("does not restrict routes without role metadata", () => {
    const handler = () => undefined;

    expect(
      new RolesGuard(new Reflector()).canActivate(createContext(handler)),
    ).toBe(true);
  });
});
