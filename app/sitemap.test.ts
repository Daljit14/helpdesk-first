import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("includes public pages and all issue guides", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/assistant"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/status"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/tools"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/forgot-password"))).toBe(true);
    expect(urls.filter((url) => /\/issues\/[^/]+$/.test(url))).toHaveLength(
      100
    );
    expect(
      urls.filter((url) => /\/issues\/[^/]+\/guide$/.test(url))
    ).toHaveLength(100);
  });
});
