import { afterEach, describe, expect, test, vi } from "vitest";
import { runTool } from "./tools";

const mocks = vi.hoisted(() => ({
  getApprovedSlugs: vi.fn(),
  suggestIssues: vi.fn(),
  loadDeviceEvidence: vi.fn(),
  readKillSwitches: vi.fn(),
}));

vi.mock("@/lib/knowledge/governance", () => ({
  getApprovedSlugs: mocks.getApprovedSlugs,
}));
vi.mock("@/lib/search", () => ({ suggestIssues: mocks.suggestIssues }));
vi.mock("@/lib/evidence/device-family", () => ({
  loadDeviceEvidence: mocks.loadDeviceEvidence,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));

const context = {
  admin: {} as never,
  session: {} as never,
  requesterId: "requester",
  organizationId: "org",
  signal: new AbortController().signal,
  emit: vi.fn(),
};

afterEach(() => vi.resetAllMocks());

describe("requester agent tools", () => {
  test("returns full model text and a bounded guide summary", async () => {
    mocks.getApprovedSlugs.mockResolvedValue(["wifi"]);
    mocks.suggestIssues.mockReturnValue([
      {
        id: "wifi",
        title: "Wi-Fi",
        category: "network",
        devices: ["Windows"],
        symptoms: ["disconnects"],
      },
    ]);
    mocks.readKillSwitches.mockResolvedValue({});
    const result = await runTool(context, "search_guides", {
      query: "wifi",
    });
    expect(result).toMatchObject({
      ok: true,
      userSummary: "1 guides found: wifi",
    });
    expect(result.ok && result.modelText).toContain("<untrusted_data");
    expect(result.ok && result.modelText.length).toBeLessThanOrEqual(6000);
  });

  test("summarizes stale diagnostics without exposing hostnames", async () => {
    mocks.loadDeviceEvidence.mockResolvedValue({
      hostname: "secret-host",
      collectedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    });
    mocks.readKillSwitches.mockResolvedValue({});
    const result = await runTool(context, "get_device_diagnostics", {});
    expect(result).toMatchObject({
      ok: true,
      userSummary: expect.stringContaining("stale"),
    });
    expect(result.userSummary).not.toContain("secret-host");
  });

  test("returns a structured result when no device is enrolled", async () => {
    mocks.loadDeviceEvidence.mockResolvedValue(undefined);
    mocks.readKillSwitches.mockResolvedValue({});
    const result = await runTool(context, "get_device_diagnostics", {});
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "no_device",
        summary: "No enrolled device is linked to this account.",
      },
    });
    expect(result).not.toMatchObject({ code: "tool_failed" });
  });

  test.each([
    ["unknown", "run_command", {}],
    ["target", "search_guides", { user_id: "other" }],
  ])("rejects %s tool requests", async (_label, name, input) => {
    const result = await runTool(context, name, input);
    expect(result).toMatchObject({ ok: false, code: "tool_rejected" });
  });
});
