import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  limiterCheck: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  deleteEq: vi.fn(),
  deleteOrgEq: vi.fn(),
  deleteSelect: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isOrgVendorDomainsEnabled: mocks.isEnabled,
}));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.limiterCheck })),
  getRateLimitConfig: () => ({ windowMs: 60_000, maxRequests: 30 }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  addOrgVendorDomainAction,
  removeOrgVendorDomainAction,
} from "./admin-vendor-domains";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  role: "org_admin",
  organizationId: "00000000-0000-4000-8000-000000000002",
  displayName: "Admin",
  isPlatformAdmin: false,
};
const domainId = "00000000-0000-4000-8000-000000000003";

function domainForm(value = "support.contoso-vpn.com") {
  const form = new FormData();
  form.set("domain", value);
  return form;
}

function removeForm(value = domainId) {
  const form = new FormData();
  form.set("id", value);
  return form;
}

describe("organization vendor domain actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.limiterCheck.mockResolvedValue({ allowed: true });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ count: 0, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.delete.mockReturnValue({ eq: mocks.deleteEq });
    mocks.deleteEq.mockReturnValue({ eq: mocks.deleteOrgEq });
    mocks.deleteOrgEq.mockReturnValue({ select: mocks.deleteSelect });
    mocks.deleteSelect.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: domainId },
      error: null,
    });
    mocks.from.mockReturnValue({
      select: mocks.select,
      insert: mocks.insert,
      delete: mocks.delete,
    });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  test("rejects disabled, non-admin, and rate-limited requests", async () => {
    mocks.isEnabled.mockReturnValue(false);
    await expect(addOrgVendorDomainAction(null, domainForm())).resolves.toEqual(
      { error: "Trusted vendor domains are disabled." }
    );
    expect(mocks.getAdminSession).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    await expect(addOrgVendorDomainAction(null, domainForm())).resolves.toEqual(
      { error: "Organization admin access required." }
    );

    mocks.getAdminSession.mockResolvedValue(session);
    mocks.limiterCheck.mockResolvedValue({ allowed: false });
    await expect(addOrgVendorDomainAction(null, domainForm())).resolves.toEqual(
      { error: "Too many vendor domain requests." }
    );
    expect(mocks.limiterCheck).toHaveBeenCalledWith(
      `org:${session.organizationId}:user:${session.userId}`
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test.each([
    ["http://support.example.com", "Only https sites can be trusted."],
    ["1.2.3.4", "Enter a domain name, not an IP address."],
    ["*.example.com", "Wildcards aren't allowed. Enter one exact domain."],
    [
      "reddit.com",
      "Social, forum, paste, file-sharing, hosting and link-shortener sites can't be official docs.",
    ],
    ["co.uk", "Enter the vendor's own domain, not a shared suffix like co.uk."],
    ["learn.microsoft.com", "This domain is already trusted as official docs."],
    ["localhost", "Enter a domain like support.example.com."],
  ])("maps domain rejection for %s", async (domain, error) => {
    await expect(
      addOrgVendorDomainAction(null, domainForm(domain))
    ).resolves.toEqual({ error });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("enforces the organization limit before inserting", async () => {
    mocks.eq.mockResolvedValue({ count: 25, error: null });
    await expect(addOrgVendorDomainAction(null, domainForm())).resolves.toEqual(
      { error: "You can trust up to 25 domains." }
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test("normalizes and inserts only for the session organization and admin", async () => {
    mocks.eq.mockResolvedValue({ count: 4, error: null });
    await expect(
      addOrgVendorDomainAction(
        null,
        domainForm("https://Support.Contoso-VPN.com/kb/1")
      )
    ).resolves.toEqual({ success: true, message: "Domain added." });
    expect(mocks.from).toHaveBeenCalledWith("org_research_vendor_domains");
    expect(mocks.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mocks.eq).toHaveBeenCalledWith(
      "organization_id",
      session.organizationId
    );
    expect(mocks.insert).toHaveBeenCalledWith({
      organization_id: session.organizationId,
      domain: "support.contoso-vpn.com",
      added_by: session.userId,
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_vendor_domain.added",
      session.organizationId
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/vendor-domains");
  });

  test("maps duplicate inserts and query failures to generic save errors", async () => {
    mocks.insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate" },
    });
    await expect(addOrgVendorDomainAction(null, domainForm())).resolves.toEqual(
      { error: "That domain is already on the list." }
    );

    mocks.eq.mockResolvedValue({ count: null, error: new Error("offline") });
    await expect(
      addOrgVendorDomainAction(null, domainForm("other.contoso.com"))
    ).resolves.toEqual({ error: "The domain could not be saved." });
  });

  test("removes only the selected domain in the authenticated organization", async () => {
    await expect(
      removeOrgVendorDomainAction(null, removeForm())
    ).resolves.toEqual({ success: true, message: "Domain removed." });
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", domainId);
    expect(mocks.deleteOrgEq).toHaveBeenCalledWith(
      "organization_id",
      session.organizationId
    );
    expect(mocks.deleteSelect).toHaveBeenCalledWith("id");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_vendor_domain.removed",
      session.organizationId
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/vendor-domains");
  });

  test("returns not-found and generic errors when removal does not succeed", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      removeOrgVendorDomainAction(null, removeForm())
    ).resolves.toEqual({ error: "That domain was not found." });

    await expect(
      removeOrgVendorDomainAction(null, removeForm("not-a-uuid"))
    ).resolves.toEqual({ error: "The domain could not be removed." });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
