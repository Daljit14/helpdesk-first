import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/issues";
import { DEV_TOOLS } from "./dev-tools";

describe("DEV_TOOLS descriptors", () => {
  it("have unique ids, valid categories and groups", () => {
    const cats = new Set(CATEGORIES.map((c) => c.id as string));
    const groups = new Set([
      "audio-video",
      "device",
      "input-display",
      "privacy",
      "support",
    ]);
    const seen = new Set<string>();
    for (const t of DEV_TOOLS) {
      expect(seen.has(t.id)).toBe(false);
      seen.add(t.id);
      expect(groups.has(t.group)).toBe(true);
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.blurb.length).toBeGreaterThan(5);
      for (const c of t.categories) expect(cats.has(c)).toBe(true);
    }
    expect(DEV_TOOLS).toHaveLength(9);
  });
});
