import { describe, expect, test } from "vitest";
import { buildDepartments } from "./departments";

const flags = {
  knowledgeGovernanceEnabled: false,
  secureAttachmentsEnabled: false,
  resolutionCenterEnabled: false,
  deviceAgentEnabled: false,
};

describe("environment profile department", () => {
  test("is only available to org admins when enabled", () => {
    const orgAdmin = buildDepartments(
      { role: "org_admin", isPlatformAdmin: false },
      { ...flags, orgEnvironmentEnabled: true }
    );
    expect(orgAdmin).toContainEqual(
      expect.objectContaining({
        id: "environment",
        label: "Environment profile",
        href: "/admin/environment",
        group: "Configure",
      })
    );

    const supportAgent = buildDepartments(
      { role: "support_agent", isPlatformAdmin: false },
      { ...flags, orgEnvironmentEnabled: true }
    );
    expect(supportAgent.map(({ id }) => id)).not.toContain("environment");
  });

  test("omits the item when the feature flag is disabled", () => {
    const departments = buildDepartments(
      { role: "org_admin", isPlatformAdmin: false },
      flags
    );
    expect(departments.map(({ id }) => id)).not.toContain("environment");
  });
});
