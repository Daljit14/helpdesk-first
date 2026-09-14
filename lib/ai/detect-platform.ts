import type { Platform } from "@/lib/helpdesk-data";

export function detectPlatform(text: string): Platform | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

  if (/\bwindows\b|\bwin10\b|\bwin11\b|\bpc\b(?!\s*phone)/i.test(normalized)) {
    return "Windows";
  }
  if (/\bmac\b|\bmacbook\b|\bmacos\b|\bos\s?x\b|\bapple\b/i.test(normalized)) {
    return "Mac";
  }
  if (/\biphone\b|\bios\b|\bipad\b/i.test(normalized)) return "iOS";
  if (/\bandroid\b/i.test(normalized)) return "Android";
  if (/\bmobile\b|\bphone\b/i.test(normalized)) return null;
  if (/\bother\b|\blinux\b|\bchromebook\b/i.test(normalized)) {
    return "Other";
  }
  return null;
}
