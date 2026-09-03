const RECENT_KEY = "hf-recent";
const MAX_RECENT = 8;
const EMPTY_RECENT: string[] = [];
let cachedStorageValue: string | null | undefined;
let cachedRecent: string[] = EMPTY_RECENT;
const listeners = new Set<() => void>();

export function getRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  const storageValue = localStorage.getItem(RECENT_KEY);
  if (storageValue === cachedStorageValue) return cachedRecent;

  cachedStorageValue = storageValue;
  try {
    const value: unknown = JSON.parse(storageValue ?? "[]");
    cachedRecent = Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : EMPTY_RECENT;
  } catch {
    cachedRecent = EMPTY_RECENT;
  }
  return cachedRecent;
}

export function pushRecentlyViewed(id: string): void {
  if (typeof window === "undefined") return;
  const next = [id, ...getRecentlyViewed().filter((item) => item !== id)].slice(
    0,
    MAX_RECENT
  );
  const storageValue = JSON.stringify(next);
  localStorage.setItem(RECENT_KEY, storageValue);
  cachedStorageValue = storageValue;
  cachedRecent = next;
  listeners.forEach((listener) => listener());
}

export function subscribeToRecentlyViewed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
