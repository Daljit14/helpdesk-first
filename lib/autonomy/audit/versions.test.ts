import { describe, expect, test, vi } from "vitest";
import { auditVersions, initiatedBy } from "./versions";

vi.mock("../config", () => ({ getPlannerProvider: () => "deterministic" }));

describe("audit versions", () => {
  test("stamps planner, policy, verifier and capability versions", () => {
    expect(
      auditVersions({ id: "route_to_department", version: 1 })
    ).toMatchObject({
      planner: "deterministic",
      capability: "route_to_department@1",
    });
  });

  test("normalizes supported actors", () => {
    expect(initiatedBy("cron")).toBe("cron");
    expect(initiatedBy("user:user-1")).toBe("user:user-1");
    expect(initiatedBy("staff:staff-1")).toBe("staff:staff-1");
    expect(initiatedBy("orchestrator")).toBe("ai");
  });
});
