import { describe, expect, it } from "vitest";
import { parseAssistantParams } from "@/app/assistant/page";
import { buildDepartments } from "@/components/admin/v2/departments";

describe("UI v2 server-to-client props", () => {
  it.each(["org_admin", "support_agent"] as const)(
    "shows the Resolution Center for %s when enabled",
    (role) => {
      const departments = buildDepartments(
        { role, isPlatformAdmin: role === "org_admin" },
        {
          knowledgeGovernanceEnabled: false,
          secureAttachmentsEnabled: false,
          resolutionCenterEnabled: true,
        }
      );
      expect(
        departments.some((department) => department.id === "resolution-center")
      ).toBe(true);
    }
  );

  it("hides the Resolution Center when disabled", () => {
    const departments = buildDepartments(
      { role: "support_agent", isPlatformAdmin: false },
      {
        knowledgeGovernanceEnabled: false,
        secureAttachmentsEnabled: false,
        resolutionCenterEnabled: false,
      }
    );
    expect(
      departments.some((department) => department.id === "resolution-center")
    ).toBe(false);
  });

  it("keeps admin departments serializable", () => {
    const departments = buildDepartments(
      { role: "org_admin", isPlatformAdmin: true },
      {
        knowledgeGovernanceEnabled: true,
        secureAttachmentsEnabled: true,
        resolutionCenterEnabled: true,
      }
    );
    expect(JSON.parse(JSON.stringify(departments))).toEqual(departments);
    expect(JSON.stringify(departments)).not.toContain("RegExp");
  });

  it("keeps assistant parameter parsing serializable", () => {
    const parsed = parseAssistantParams({
      q: ["wifi keeps dropping", "ignored"],
      platform: "Mac",
      intent: "solve",
      attach: "1",
    });
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parsed).toEqual({
      initialProblem: "wifi keeps dropping",
      initialPlatform: "Mac",
      intent: "solve",
      attach: true,
      autoStart: true,
    });
  });

  it("normalizes unsupported assistant platform and non-solve intent", () => {
    expect(
      parseAssistantParams({ q: "hello", platform: "Linux", intent: "human" })
    ).toEqual({
      initialProblem: "hello",
      initialPlatform: null,
      intent: "human",
      attach: false,
      autoStart: false,
    });
  });
});
