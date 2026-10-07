const CRASHED_APP_DISPLAY_NAMES = [
  "Outlook",
  "Teams",
  "OneDrive",
  "Excel",
  "Word",
  "PowerPoint",
  "Chrome",
  "Edge",
  "Firefox",
  "Safari",
  "Zoom",
  "Slack",
  "File Explorer",
  "Finder",
] as const;

const crashedAppDisplayNameSet = new Set<string>(CRASHED_APP_DISPLAY_NAMES);

const RECENT_ERROR_EVENT_COUNTS = [
  "windowHours",
  "total",
  "appCrash",
  "appHang",
  "signIn",
  "driver",
  "disk",
  "network",
  "other",
] as const;

export const DEVICE_SIGNED_IDENTIFIER_FIELDS: Readonly<
  Record<string, readonly string[]>
> = { wifi_status: ["ssid"], printers: ["names"] };

export function signedIdentifiersFromRecord(
  kind: string,
  data: unknown
): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const identifiers: string[] = [];
  for (const field of DEVICE_SIGNED_IDENTIFIER_FIELDS[kind] ?? []) {
    const value = record[field];
    if (typeof value === "string") {
      if (value.length >= 1 && value.length <= 80) identifiers.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 40)) {
        if (typeof item === "string" && item.length >= 1 && item.length <= 80)
          identifiers.push(item);
      }
    }
  }
  return identifiers;
}

export function sanitizeDiagnosticRecord(
  kind: string,
  summary: string,
  data: Record<string, unknown>
): { summary: string; data: Record<string, unknown> } {
  if (kind !== "recent_error_events") return { summary, data };

  const sanitized: Record<string, unknown> = {};
  for (const key of RECENT_ERROR_EVENT_COUNTS) {
    const value = data[key];
    if (
      value === null ||
      (typeof value === "number" && Number.isFinite(value) && value >= 0)
    )
      sanitized[key] = value;
  }

  const newestAt = data.newestAt;
  if (
    typeof newestAt === "string" &&
    newestAt.length <= 40 &&
    Number.isFinite(Date.parse(newestAt))
  )
    sanitized.newestAt = newestAt;

  const crashedApps = data.crashedApps;
  if (Array.isArray(crashedApps))
    sanitized.crashedApps = crashedApps.filter(
      (name): name is string =>
        typeof name === "string" && crashedAppDisplayNameSet.has(name)
    );

  const total = typeof sanitized.total === "number" ? sanitized.total : 0;
  const windowHours =
    typeof sanitized.windowHours === "number" ? sanitized.windowHours : 24;
  return {
    summary: `${total} recent error events in the last ${windowHours} hours.`,
    data: sanitized,
  };
}

export const DIAGNOSTIC_CRASHED_APP_DISPLAY_NAMES = CRASHED_APP_DISPLAY_NAMES;
