import type { Request } from "express";

import { readClientMetadata } from "./client-metadata";

const createRequest = (userAgent?: string, ip?: string): Request =>
  ({ headers: { "user-agent": userAgent }, ip }) as unknown as Request;

describe("readClientMetadata", () => {
  it("reads the user agent and the address", () => {
    expect(
      readClientMetadata(createRequest("trainer-client/0.1.0", "10.0.0.5")),
    ).toEqual({ userAgent: "trainer-client/0.1.0", ipAddress: "10.0.0.5" });
  });

  it("stores missing and blank values as null", () => {
    expect(readClientMetadata(createRequest(undefined, undefined))).toEqual({
      userAgent: null,
      ipAddress: null,
    });
    expect(readClientMetadata(createRequest("   ", "  "))).toEqual({
      userAgent: null,
      ipAddress: null,
    });
  });

  it("truncates an oversized user agent", () => {
    const metadata = readClientMetadata(createRequest("a".repeat(400)));

    expect(metadata.userAgent).toHaveLength(256);
  });
});
