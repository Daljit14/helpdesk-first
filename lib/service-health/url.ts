import { isIP } from "node:net";

export function validateStatusBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const ipHost =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port !== "" && url.port !== "443") ||
      !hostname.includes(".") ||
      isIP(ipHost) !== 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedIncidentUrl(
  raw: string,
  configuredHosts: string[] = []
): boolean {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const allowedHosts = new Set([
      "admin.microsoft.com",
      "www.google.com",
      "stspg.io",
      ...configuredHosts.map((host) => host.toLowerCase()),
    ]);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      allowedHosts.has(hostname)
    );
  } catch {
    return false;
  }
}

export function sanitizeServiceText(value: string, maxLength: number): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizedTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
