import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToolResults,
  getToolResults,
  saveToolResult,
  TOOL_RESULTS_KEY,
} from "./tool-results-store";

function ensureStorage() {
  const g = globalThis as unknown as { window?: { sessionStorage?: Storage } };
  if (!g.window) g.window = {};
  if (!g.window.sessionStorage) {
    const map = new Map<string, string>();
    g.window.sessionStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }
  return g.window.sessionStorage!;
}

describe("tool results store", () => {
  beforeEach(() => {
    ensureStorage().removeItem(TOOL_RESULTS_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves and lists results, newest first, replacing by id", () => {
    expect(saveToolResult("a", "first", "Tool A")).toBe(true);
    expect(saveToolResult("b", "second")).toBe(true);
    expect(saveToolResult("a", "first again", "Tool A")).toBe(true);
    const list = getToolResults();
    expect(list.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(list.find((r) => r.id === "a")?.summary).toBe("first again");
  });

  it("ignores corrupt storage", () => {
    ensureStorage().setItem(TOOL_RESULTS_KEY, "{not json");
    expect(getToolResults()).toEqual([]);
    ensureStorage().setItem(
      TOOL_RESULTS_KEY,
      JSON.stringify({
        x: { nope: true },
        y: { id: "y", summary: "ok", at: 1 },
      })
    );
    expect(getToolResults().map((r) => r.id)).toEqual(["y"]);
  });

  it("never throws when storage is blocked", () => {
    ensureStorage();
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(saveToolResult("a", "x")).toBe(false);
  });

  it("clears", () => {
    saveToolResult("a", "x");
    clearToolResults();
    expect(getToolResults()).toEqual([]);
  });
});
