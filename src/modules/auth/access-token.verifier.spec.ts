import {
  AccessTokenVerifier,
  extractBearerToken,
} from "./access-token.verifier";
import { JWT_ALGORITHMS } from "./jwt.constants";
import type { TokenVerifier } from "./ports/token-verifier.port";

const validPayload = {
  sub: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
  email: "operator@example.test",
  role: "operator",
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

const createVerifier = (
  verifyAsync: jest.Mock,
): { verifier: AccessTokenVerifier; verifyAsync: jest.Mock } => {
  const tokenVerifier: TokenVerifier = { verifyAsync };

  return { verifier: new AccessTokenVerifier(tokenVerifier), verifyAsync };
};

describe("extractBearerToken", () => {
  it("accepts the scheme in any case", () => {
    expect(extractBearerToken("bearer token-value")).toBe("token-value");
    expect(extractBearerToken("Bearer token-value")).toBe("token-value");
  });

  it("rejects a missing or malformed header", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken("token-value")).toBeUndefined();
    expect(extractBearerToken("Basic token-value")).toBeUndefined();
    expect(extractBearerToken("Bearer ")).toBeUndefined();
  });
});

describe(AccessTokenVerifier.name, () => {
  it("returns the verified claims and pins the signing algorithm", async () => {
    const { verifier, verifyAsync } = createVerifier(
      jest.fn().mockResolvedValue(validPayload),
    );

    await expect(verifier.verify("Bearer token")).resolves.toEqual(
      validPayload,
    );

    expect(verifyAsync).toHaveBeenCalledWith("token", {
      algorithms: JWT_ALGORITHMS,
    });
  });

  it("keeps registered claims added to signing later", async () => {
    const payload = { ...validPayload, iss: "system-112", jti: "token-1" };
    const { verifier } = createVerifier(jest.fn().mockResolvedValue(payload));

    await expect(verifier.verify("Bearer token")).resolves.toEqual(payload);
  });

  it("rejects a request without an Authorization header", async () => {
    const { verifier, verifyAsync } = createVerifier(jest.fn());

    await expect(verifier.verify(undefined)).resolves.toBeNull();

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it("rejects a token that fails verification", async () => {
    const { verifier } = createVerifier(
      jest.fn().mockRejectedValue(new Error("invalid signature")),
    );

    await expect(verifier.verify("Bearer token")).resolves.toBeNull();
  });

  it("rejects claims that do not match the current shape", async () => {
    const { verifier } = createVerifier(
      jest.fn().mockResolvedValue({ ...validPayload, role: "superuser" }),
    );

    await expect(verifier.verify("Bearer token")).resolves.toBeNull();
  });
});
