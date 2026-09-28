import type { Device } from "./issues";

export const PLATFORM_ALIASES: Record<string, Device> = {
  windows: "Windows",
  win: "Windows",
  mac: "Mac",
  macos: "Mac",
  ios: "iOS",
  android: "Android",
  other: "Other",
};

export function normalizePlatform(
  value: string | string[] | undefined | null
): Device | null {
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const normalized = raw.trim().toLowerCase();
  return normalized ? (PLATFORM_ALIASES[normalized] ?? null) : null;
}

export function platformSlug(device: Device): string {
  return device.toLowerCase();
}
