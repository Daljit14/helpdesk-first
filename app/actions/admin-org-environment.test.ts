import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  limiterCheck: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isOrgEnvironmentEnabled: mocks.isEnabled,
}));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: mocks.limiterCheck }),
  getRateLimitConfig: () => ({ windowMs: 60_000, maxRequests: 30 }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  confirmOrgEnvironmentAction,
  saveOrgEnvironmentAction,
} from "./admin-org-environment";

const session = {
  userId: "user-1",
  email: "admin@example.com",
  role: "org_admin",
  organizationId: "org-1",
  displayName: "Admin",
  isPlatformAdmin: false,
};

function createFormData(): FormData {
  const form = new FormData();
  form.set("vpnClient", " GlobalProtect ");
  form.set("mdmProvider", "intune");
  form.set("emailStack", "microsoft365");
  form.set("chatStack", "");
  form.set("ssoProvider", "entra");
  form.append("standardPlatforms", "Windows");
  form.append("standardPlatforms", "Mac");
  form.set("standardOsVersions", "Windows 11\nmacOS 15\nWindows 11");
  form.set("printerFleet", "Office printer, Warehouse printer");
  form.set("approvedSoftware", "Browser");
  form.set("idpEnforcesMfa", "on");
  return form;
}

describe("organization environment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.limiterCheck.mockResolvedValue({ allowed: true });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({
      eq: mocks.eq,
    });
    mocks.eq.mockReturnValue({
      select: mocks.select,
      maybeSingle: mocks.maybeSingle,
    });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: { organization_id: "org-1" },
      error: null,
    });
    mocks.from.mockReturnValue({
      upsert: mocks.upsert,
      update: mocks.update,
    });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  test("saves a validated draft and clears confirmation fields", async () => {
    const result = await saveOrgEnvironmentAction(null, createFormData());

    expect(result).toEqual({ success: true });
    expect(mocks.from).toHaveBeenCalledWith("org_environment_profile");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        vpn_client: "GlobalProtect",
        mdm_provider: "intune",
        chat_stack: null,
        standard_platforms: ["Windows", "Mac"],
        standard_os_versions: ["Windows 11", "macOS 15"],
        printer_fleet: ["Office printer", "Warehouse printer"],
        status: "draft",
        updated_by: "user-1",
        confirmed_by: null,
        confirmed_at: null,
        idp_enforces_mfa: true,
      }),
      { onConflict: "organization_id" }
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_environment.saved",
      "org-1"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/environment");
  });

  test("retries saves without the optional MFA column when migration is missing", async () => {
    mocks.upsert
      .mockResolvedValueOnce({
        error: {
          code: "42703",
          message: "column idp_enforces_mfa does not exist",
        },
      })
      .mockResolvedValueOnce({ error: null });

    await expect(
      saveOrgEnvironmentAction(null, createFormData())
    ).resolves.toEqual({ success: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[1][0]).not.toHaveProperty(
      "idp_enforces_mfa"
    );
  });

  test("does not retry when a different profile column is missing", async () => {
    mocks.upsert.mockResolvedValue({
      error: {
        code: "42703",
        message: "column printer_fleet does not exist",
      },
    });

    await expect(
      saveOrgEnvironmentAction(null, createFormData())
    ).resolves.toEqual({ error: "Environment profile could not be saved." });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  test("rejects non-admins, disabled state, invalid input, and rate-limited requests", async () => {
    mocks.isEnabled.mockReturnValue(false);
    await expect(
      saveOrgEnvironmentAction(null, createFormData())
    ).resolves.toEqual({
      error: "Organization environment profile is disabled.",
    });
    expect(mocks.getAdminSession).not.toHaveBeenCalled();

    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    await expect(
      saveOrgEnvironmentAction(null, createFormData())
    ).resolves.toEqual({ error: "Organization admin access required." });

    mocks.getAdminSession.mockResolvedValue(session);
    mocks.limiterCheck.mockResolvedValue({ allowed: false });
    await expect(
      saveOrgEnvironmentAction(null, createFormData())
    ).resolves.toEqual({ error: "Too many environment profile requests." });

    mocks.limiterCheck.mockResolvedValue({ allowed: true });
    const invalid = createFormData();
    invalid.set("mdmProvider", "unsupported-provider");
    await expect(saveOrgEnvironmentAction(null, invalid)).resolves.toEqual({
      error: "Review the environment profile fields and try again.",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  test("confirms the organization row and records the audit event", async () => {
    const result = await confirmOrgEnvironmentAction(null, new FormData());

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "confirmed",
        confirmed_by: "user-1",
        confirmed_at: expect.any(String),
        updated_by: "user-1",
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_environment.confirmed",
      "org-1"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/environment");
  });

  test("returns a generic error when the organization row does not exist", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      confirmOrgEnvironmentAction(null, new FormData())
    ).resolves.toEqual({
      error: "Environment profile could not be confirmed.",
    });
  });
});
