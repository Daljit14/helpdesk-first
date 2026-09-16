import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("cron route authentication coverage", () => {
  test("every cron route requires CRON_SECRET through its auth helper", async () => {
    const root = join(process.cwd(), "app/api/cron");
    const directories = await readdir(root, { withFileTypes: true });
    const routes = directories
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, "route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const source = await readFile(route, "utf8");
      expect(source).toMatch(/CRON_SECRET/);
      expect(source).toMatch(/matchesSecret|timingSafeEqual/);
      expect(source).toMatch(/authorization/);
    }
  });
});
