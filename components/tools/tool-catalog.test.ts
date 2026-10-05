import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/issues";
import {
  CATALOG,
  CATALOG_GROUPS,
  catalogToolsForCategory,
  isCatalogId,
} from "./tool-catalog";

describe("tool catalog", () => {
  it("has unique tools and every group tool exists exactly once", () => {
    const seen = new Set<string>();
    for (const group of CATALOG_GROUPS) {
      expect(group.tools.length).toBeGreaterThan(0);
      for (const id of group.tools) {
        expect(isCatalogId(id)).toBe(true);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(Object.keys(CATALOG).length);
  });

  it("keeps the built-in tool order and adds extras for every category", () => {
    expect(catalogToolsForCategory("network")[0]).toBe("speed-test");
    for (const category of CATEGORIES) {
      const ids = catalogToolsForCategory(category.id);
      expect(ids.length).toBeGreaterThan(1);
      expect(ids.length).toBeLessThanOrEqual(8);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids[ids.length - 1]).toBe("support-report");
    }
  });

  it("offers the printer test page on printer guides", () => {
    expect(catalogToolsForCategory("printer")).toContain("print-test");
  });
});
