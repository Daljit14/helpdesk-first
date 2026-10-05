/**
 * Tiny sessionStorage-backed store so the Support report builder can
 * include whatever the person already ran in other tools. Everything is
 * wrapped in try/catch because storage can be blocked (private mode,
 * policies) and must never break a tool.
 */
export const TOOL_RESULTS_KEY = "hf-tool-results";

export type StoredToolResult = {
  id: string;
  /** Human title, e.g. "Mouse & trackpad". */
  title?: string;
  summary: string;
  /** Epoch ms when saved. */
  at: number;
};

type Store = Record<string, StoredToolResult>;

function readStore(): Store {
  try {
    const raw = window.sessionStorage.getItem(TOOL_RESULTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as StoredToolResult).summary === "string" &&
        typeof (v as StoredToolResult).at === "number"
      ) {
        out[k] = v as StoredToolResult;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Saves (or replaces) the latest summary for a tool. Returns false when storage is unavailable. */
export function saveToolResult(
  id: string,
  summary: string,
  title?: string
): boolean {
  try {
    if (typeof window === "undefined") return false;
    const store = readStore();
    store[id] = {
      id,
      title,
      summary: summary.slice(0, 4000),
      at: new Date().getTime(),
    };
    window.sessionStorage.setItem(TOOL_RESULTS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** All saved results, newest first. */
export function getToolResults(): StoredToolResult[] {
  if (typeof window === "undefined") return [];
  return Object.values(readStore()).sort((a, b) => b.at - a.at);
}

export function clearToolResults(): void {
  try {
    window.sessionStorage.removeItem(TOOL_RESULTS_KEY);
  } catch {
    // ignore
  }
}
