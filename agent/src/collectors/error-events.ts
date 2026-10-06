import { record } from "./index";

export type RecentErrorCategory =
  "appCrash" | "appHang" | "signIn" | "driver" | "disk" | "network" | "other";

export type CategorizedErrorEvent = {
  category: RecentErrorCategory;
  at?: string | number | null;
  app?: string | null;
};

export const APP_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  outlook: "Outlook",
  olk: "Outlook",
  teams: "Teams",
  "ms-teams": "Teams",
  onedrive: "OneDrive",
  excel: "Excel",
  winword: "Word",
  powerpnt: "PowerPoint",
  chrome: "Chrome",
  "google chrome": "Chrome",
  msedge: "Edge",
  "microsoft edge": "Edge",
  firefox: "Firefox",
  safari: "Safari",
  zoom: "Zoom",
  "zoom.us": "Zoom",
  slack: "Slack",
  explorer: "File Explorer",
  finder: "Finder",
};

const CATEGORIES: readonly RecentErrorCategory[] = [
  "appCrash",
  "appHang",
  "signIn",
  "driver",
  "disk",
  "network",
  "other",
];

export function allowlistedAppDisplayName(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const basename = value.trim().replaceAll("\\", "/").split("/").at(-1) ?? "";
  const name = basename.replace(/\.(?:exe|app|bin|com)$/i, "").toLowerCase();
  return APP_DISPLAY_NAMES[name] ?? null;
}

function timestamp(value: CategorizedErrorEvent["at"]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function recentErrorEventsRecord(
  events: CategorizedErrorEvent[],
  unavailable: readonly RecentErrorCategory[] = []
) {
  const boundedEvents = events.slice(0, 500);
  const unavailableCategories = new Set(unavailable);
  const counts = new Map<RecentErrorCategory, number>(
    CATEGORIES.map((category) => [category, 0])
  );
  for (const event of boundedEvents) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  const count = (category: RecentErrorCategory) => counts.get(category) ?? 0;

  let newestTime: number | null = null;
  for (const event of boundedEvents) {
    const time = timestamp(event.at);
    if (time !== null && (newestTime === null || time > newestTime))
      newestTime = time;
  }
  const crashedApps = [
    ...new Set(
      boundedEvents
        .filter((event) => event.category === "appCrash")
        .map((event) => allowlistedAppDisplayName(event.app))
        .filter((name): name is string => Boolean(name))
    ),
  ].slice(0, 10);

  return record("recent_error_events", {
    windowHours: 24,
    total: boundedEvents.length,
    appCrash: unavailableCategories.has("appCrash") ? null : count("appCrash"),
    appHang: unavailableCategories.has("appHang") ? null : count("appHang"),
    signIn: unavailableCategories.has("signIn") ? null : count("signIn"),
    driver: unavailableCategories.has("driver") ? null : count("driver"),
    disk: unavailableCategories.has("disk") ? null : count("disk"),
    network: unavailableCategories.has("network") ? null : count("network"),
    other: unavailableCategories.has("other") ? null : count("other"),
    crashedApps,
    newestAt: newestTime === null ? null : new Date(newestTime).toISOString(),
  });
}
