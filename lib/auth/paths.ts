export function safeNextPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2048 ||
    /[\\\x00-\x1F\x7F ]/.test(value) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://placeholder.invalid");
    return url.origin === "https://placeholder.invalid"
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}

export function isSafeNextPath(value: string): boolean {
  return safeNextPath(value, "\u0000") !== "\u0000";
}
