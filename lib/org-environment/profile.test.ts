import { afterEach, describe, expect, test, vi } from "vitest";
import {
  defaultPlatform,
  loadConfirmedOrgEnvironment,
  profileAnswers,
} from "./profile";
import type { OrgEnvironmentProfile } from "./types";

const profile: OrgEnvironmentProfile = {
  vpnClient: "Secure VPN",
  mdmProvider: "intune",
  emailStack: "microsoft365",
  chatStack: "teams",
  ssoProvider: "entra",
  standardPlatforms: ["Windows"],
  standardOsVersions: ["Windows 11"],
  printerFleet: ["Office printer"],
  approvedSoftware: ["Browser"],
  status: "confirmed",
  confirmedAt: "2026-10-05T12:00:00.000Z",
};

function adminFor(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return { client: { from: vi.fn(() => query) }, query };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("organization environment profile helpers", () => {
  test("synthesizes only platform and managed-account answers", () => {
    expect(profileAnswers(profile)).toEqual([
      {
        questionId: "which-platform",
        answer: "Windows (organization standard)",
        source: "org_profile",
      },
      {
        questionId: "account-managed",
        answer: "Yes — managed by the organization (Microsoft 365)",
        source: "org_profile",
      },
    ]);
    expect(
      profileAnswers({
        ...profile,
        standardPlatforms: ["Other"],
        emailStack: "google_workspace",
      })
    ).toEqual([
      {
        questionId: "account-managed",
        answer: "Yes — managed by the organization (Google Workspace)",
        source: "org_profile",
      },
    ]);
    expect(
      profileAnswers({
        ...profile,
        standardPlatforms: ["Windows", "Mac"],
        emailStack: "other",
      })
    ).toEqual([
      {
        questionId: "account-managed",
        answer: "Yes — managed by the organization (organization email)",
        source: "org_profile",
      },
    ]);
  });

  test("uses only one non-Other platform as the default", () => {
    expect(defaultPlatform(profile)).toBe("Windows");
    expect(defaultPlatform({ ...profile, standardPlatforms: ["Other"] })).toBe(
      null
    );
    expect(
      defaultPlatform({ ...profile, standardPlatforms: ["Windows", "Mac"] })
    ).toBe(null);
  });

  test("does not query when the flag is off", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "false");
    const { client } = adminFor({ data: profile, error: null });
    await expect(
      loadConfirmedOrgEnvironment(client as never, "org-1")
    ).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  test("loads a confirmed profile and fails open for draft or query errors", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "true");
    const row = {
      vpn_client: profile.vpnClient,
      mdm_provider: profile.mdmProvider,
      email_stack: profile.emailStack,
      chat_stack: profile.chatStack,
      sso_provider: profile.ssoProvider,
      standard_platforms: profile.standardPlatforms,
      standard_os_versions: profile.standardOsVersions,
      printer_fleet: profile.printerFleet,
      approved_software: profile.approvedSoftware,
      status: "confirmed",
      confirmed_at: profile.confirmedAt,
    };
    const confirmed = adminFor({ data: row, error: null });
    await expect(
      loadConfirmedOrgEnvironment(confirmed.client as never, "org-1")
    ).resolves.toEqual(profile);

    const draft = adminFor({
      data: { ...row, status: "draft", confirmed_at: null },
      error: null,
    });
    await expect(
      loadConfirmedOrgEnvironment(draft.client as never, "org-1")
    ).resolves.toBeNull();

    const errored = adminFor({
      data: null,
      error: { message: "missing table" },
    });
    await expect(
      loadConfirmedOrgEnvironment(errored.client as never, "org-1")
    ).resolves.toBeNull();
  });

  test("fails open when the profile query throws", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "true");
    const client = {
      from: vi.fn(() => {
        throw new Error("query unavailable");
      }),
    };
    await expect(
      loadConfirmedOrgEnvironment(client as never, "org-1")
    ).resolves.toBeNull();
  });
});
