import { afterEach, describe, expect, test, vi } from "vitest";
import { applyGuideHold, isHoldWorthy } from "./guide-hold";

const { mode, createAdminClient } = vi.hoisted(() => ({
  mode: vi.fn(() => "off"),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({ getKnowledgeGuideHoldMode: mode }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

function adminWith(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    limit: vi.fn(async () => result),
  };
  const admin = { from: vi.fn(() => query) };
  createAdminClient.mockReturnValue(admin);
  return { admin, query };
}

const rows = [
  { guide_slug: "wifi", kind: "low_success", severity: "critical" },
  { guide_slug: "vpn", kind: "guide_reported_wrong", severity: "warning" },
  { guide_slug: "printer", kind: "high_escalation", severity: "warning" },
];
const slugs = ["wifi", "vpn", "printer", "email"];

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("isHoldWorthy", () => {
  test("holds critical findings and staff wrong reports only", () => {
    expect(isHoldWorthy({ kind: "broken_link", severity: "critical" })).toBe(
      true
    );
    expect(
      isHoldWorthy({ kind: "guide_reported_wrong", severity: "warning" })
    ).toBe(true);
    expect(isHoldWorthy({ kind: "low_success", severity: "warning" })).toBe(
      false
    );
  });
});

describe("applyGuideHold", () => {
  test("off mode and missing org never query findings", async () => {
    await expect(applyGuideHold("org", slugs)).resolves.toEqual(slugs);
    mode.mockReturnValue("enforce");
    await expect(applyGuideHold(null, slugs)).resolves.toEqual(slugs);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("watch mode logs the slugs it would hold and keeps all guides", async () => {
    mode.mockReturnValue("watch");
    const { query } = adminWith({ data: rows, error: null });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(applyGuideHold("org-1", slugs)).resolves.toEqual(slugs);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("status", "open");
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "knowledge.guide_hold.watch",
      organizationId: "org-1",
      slugs: ["wifi", "vpn"],
    });
  });

  test("enforce mode removes held guides", async () => {
    mode.mockReturnValue("enforce");
    adminWith({ data: rows, error: null });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(applyGuideHold("org-1", slugs)).resolves.toEqual([
      "printer",
      "email",
    ]);
  });

  test("no matching findings returns the list without logging", async () => {
    mode.mockReturnValue("enforce");
    adminWith({ data: [], error: null });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(applyGuideHold("org-1", slugs)).resolves.toEqual(slugs);
    expect(info).not.toHaveBeenCalled();
  });

  test("lookup errors fail open", async () => {
    mode.mockReturnValue("enforce");
    adminWith({ data: null, error: new Error("down") });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(applyGuideHold("org-1", slugs)).resolves.toEqual(slugs);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
