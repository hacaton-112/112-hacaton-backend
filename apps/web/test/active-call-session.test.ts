import { beforeEach, describe, expect, it } from "bun:test";

import {
  clearActiveTrainingSession,
  readActiveTrainingSession,
  writeActiveTrainingSession,
} from "../src/lib/active-call-session";

// Тесты идут в bun без DOM: хранилище подменяем минимальной реализацией.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const OPERATOR = "1f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f";
const OTHER_OPERATOR = "2f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f";

describe("active training session storage", () => {
  beforeEach(() => {
    clearActiveTrainingSession();
  });

  it("returns the session back to the operator who stored it", () => {
    writeActiveTrainingSession(OPERATOR, "session-1");

    expect(readActiveTrainingSession(OPERATOR)).toBe("session-1");
  });

  it("hides the session from another operator on the same machine", () => {
    writeActiveTrainingSession(OPERATOR, "session-1");

    expect(readActiveTrainingSession(OTHER_OPERATOR)).toBeNull();
  });

  it("recovers nothing before the operator is known", () => {
    writeActiveTrainingSession(OPERATOR, "session-1");

    expect(readActiveTrainingSession(undefined)).toBeNull();
  });

  it("stores nothing while the operator is unknown", () => {
    writeActiveTrainingSession(undefined, "session-1");

    expect(readActiveTrainingSession(OPERATOR)).toBeNull();
  });

  it("ignores a key left by an earlier unscoped build", () => {
    localStorage.setItem("system112.activeTrainingSession", "session-1");

    expect(readActiveTrainingSession(OPERATOR)).toBeNull();
  });

  it("forgets the session once it is cleared", () => {
    writeActiveTrainingSession(OPERATOR, "session-1");
    clearActiveTrainingSession();

    expect(readActiveTrainingSession(OPERATOR)).toBeNull();
  });
});
