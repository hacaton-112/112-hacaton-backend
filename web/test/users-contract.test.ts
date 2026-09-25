import { describe, expect, test } from "bun:test";

import { AuthUserSchema } from "../src/contracts/auth";
import { passwordProblem } from "../src/contracts/users";

const user = {
  id: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
  email: "operator@example.test",
  fullName: "Иван Иванов",
  role: "operator",
  isActive: true,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

describe("user account contract", () => {
  test("accepts account lifecycle fields returned by backend", () => {
    expect(AuthUserSchema.parse(user)).toEqual(user);
  });

  test("requires account status in a backend response", () => {
    const { isActive: _isActive, ...withoutStatus } = user;

    expect(AuthUserSchema.safeParse(withoutStatus).success).toBe(false);
  });

  test("uses the same minimum password rules as backend", () => {
    expect(passwordProblem("short1")).not.toBeNull();
    expect(passwordProblem("password")).not.toBeNull();
    expect(passwordProblem("12345678")).not.toBeNull();
    expect(passwordProblem("Password1")).toBeNull();
  });
});
