import { beforeEach, describe, expect, it } from "vitest";
import { consumeRedirect, currentPathname, storeRedirect } from "./usePostLoginRedirect";

function createSessionStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("usePostLoginRedirect helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      writable: true,
      value: createSessionStorageMock(),
    });
  });

  it("persists redirect until consumed", () => {
    storeRedirect("/duel?join=abc123");

    expect(consumeRedirect()).toBe("/duel?join=abc123");
    expect(consumeRedirect()).toBeNull();
  });

  it("builds canonical current path with search/hash", () => {
    expect(
      currentPathname({
        pathname: "/duel",
        search: "?join=abc123",
        hash: "#invite",
      }),
    ).toBe("/duel?join=abc123#invite");
  });
});
