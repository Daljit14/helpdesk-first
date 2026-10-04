import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearServiceHealthMemoryCache,
  getCachedSnapshot,
  SERVICE_HEALTH_CACHE_TTL_SECONDS,
  serviceHealthCacheKey,
  setCachedSnapshot,
} from "./cache";
import type { ServiceHealthSnapshot } from "./types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mocks.get,
    set: mocks.set,
  })),
}));

const snapshot: ServiceHealthSnapshot = {
  incidents: [],
  sources: [{ source: "google_workspace", name: "Google Workspace", ok: true }],
  checkedAt: "2026-10-04T12:00:00.000Z",
};

afterEach(() => {
  clearServiceHealthMemoryCache();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("service health cache", () => {
  test("uses an expiring in-memory fallback when Redis is not configured", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const key = serviceHealthCacheKey("org-1");
    expect(key).toBe("helpdesk-first:service-health:v1:org-1");
    await setCachedSnapshot("org-1", snapshot);
    expect(await getCachedSnapshot("org-1")).toEqual(snapshot);
    vi.spyOn(Date, "now").mockReturnValue(
      1000 + SERVICE_HEALTH_CACHE_TTL_SECONDS * 1000 + 1
    );
    expect(await getCachedSnapshot("org-1")).toBeNull();
  });

  test("falls back to memory when Redis operations fail", async () => {
    mocks.get.mockRejectedValue(new Error("redis unavailable"));
    mocks.set.mockRejectedValue(new Error("redis unavailable"));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    await setCachedSnapshot("org-2", snapshot);
    expect(await getCachedSnapshot("org-2")).toEqual(snapshot);
  });
});
