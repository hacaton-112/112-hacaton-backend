import { beforeEach, describe, expect, it } from "bun:test";

import { hydrateAuthStore, useAuthStore } from "../src/stores/auth.store";

describe("browser auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: null,
      user: null,
      isHydrated: false,
    });
  });

  it("hydrates without calling a Tauri plugin in a regular browser", async () => {
    await hydrateAuthStore();

    expect(useAuthStore.getState().isHydrated).toBe(true);
  });
});
