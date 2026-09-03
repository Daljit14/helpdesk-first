import { describe, expect, test, beforeEach } from "vitest";
import { getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
  });

  test("prefers NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    expect(getSiteUrl()).toBe("https://example.com");
  });

  test("adds https:// to VERCEL_PROJECT_PRODUCTION_URL without protocol", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "helpdesk-first.vercel.app";
    expect(getSiteUrl()).toBe("https://helpdesk-first.vercel.app");
  });

  test("adds https:// to VERCEL_URL without protocol", () => {
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    expect(getSiteUrl()).toBe("https://preview-abc.vercel.app");
  });

  test("falls back to localhost with http", () => {
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  test("keeps http for localhost values", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "localhost:3000";
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  test("removes trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://helpdesk-first.vercel.app/";
    expect(getSiteUrl()).toBe("https://helpdesk-first.vercel.app");
  });
});
