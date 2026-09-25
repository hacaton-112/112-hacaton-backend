import {
  createRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_PATTERN,
} from "./refresh-token";

describe("createRefreshToken", () => {
  it("produces a url-safe secret of the expected size", () => {
    const token = createRefreshToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(REFRESH_TOKEN_PATTERN);
  });

  it("never repeats itself", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => createRefreshToken()),
    );

    expect(tokens.size).toBe(100);
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic and hex encoded", () => {
    const token = createRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the secret it was given", () => {
    const token = createRefreshToken();

    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it("changes completely for a one character difference", () => {
    expect(hashRefreshToken("token-a")).not.toBe(hashRefreshToken("token-b"));
  });
});
