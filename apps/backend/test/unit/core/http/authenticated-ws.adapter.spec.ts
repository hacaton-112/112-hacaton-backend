import { selectWebSocketProtocol } from "@/core/http/authenticated-ws.adapter";

describe(selectWebSocketProtocol.name, () => {
  it("selects bearer when its token follows it", () => {
    expect(selectWebSocketProtocol(new Set(["bearer", "token"]))).toBe(
      "bearer",
    );
  });

  it("rejects an incomplete protocol pair", () => {
    expect(selectWebSocketProtocol(new Set(["bearer"]))).toBe(false);
  });
});
