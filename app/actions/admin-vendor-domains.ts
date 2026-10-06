"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isOrgVendorDomainsEnabled } from "@/lib/admin/flags";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import {
  normalizeOrgVendorDomain,
  ORG_VENDOR_DOMAIN_LIMIT,
} from "@/lib/research/vendor-domains";
import { createAdminClient } from "@/lib/supabase/admin";

export type VendorDomainsActionState =
  { success: true; message?: string } | { error: string };
type Result = VendorDomainsActionState | null;
type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 20 },
  "org-vendor-domains"
);
const idSchema = z.string().uuid();

const rejectionMessages = {
  invalid: "Enter a domain like support.example.com.",
  not_https: "Only https sites can be trusted.",
  ip_address: "Enter a domain name, not an IP address.",
  wildcard: "Wildcards aren't allowed. Enter one exact domain.",
  blocked:
    "Social, forum, paste, file-sharing, hosting and link-shortener sites can't be official docs.",
  public_suffix:
    "Enter the vendor's own domain, not a shared suffix like co.uk.",
  already_official: "This domain is already trusted as official docs.",
} as const;

async function sessionOrError(): Promise<Session | { error: string }> {
  if (!isOrgVendorDomainsEnabled())
    return { error: "Trusted vendor domains are disabled." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  if (
    !(
      await limiter.check(
        `org:${session.organizationId}:user:${session.userId}`
      )
    ).allowed
  )
    return { error: "Too many vendor domain requests." };
  return session;
}

export async function addOrgVendorDomainAction(
  _previous: Result,
  formData: FormData
): Promise<VendorDomainsActionState> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const rawDomain = formData.get("domain");
  const normalized = normalizeOrgVendorDomain(
    typeof rawDomain === "string" ? rawDomain : ""
  );
  if (!normalized.ok) return { error: rejectionMessages[normalized.reason] };

  try {
    const admin = createAdminClient();
    const count = await admin
      .from("org_research_vendor_domains")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId);
    if (count.error) return { error: "The domain could not be saved." };
    if ((count.count ?? 0) >= ORG_VENDOR_DOMAIN_LIMIT)
      return { error: "You can trust up to 25 domains." };

    const inserted = await admin.from("org_research_vendor_domains").insert({
      organization_id: session.organizationId,
      domain: normalized.domain,
      added_by: session.userId,
    });
    if (inserted.error?.code === "23505")
      return { error: "That domain is already on the list." };
    if (inserted.error) return { error: "The domain could not be saved." };

    await recordAudit(
      session,
      "org_vendor_domain.added",
      session.organizationId
    );
    revalidatePath("/admin/vendor-domains");
    return { success: true, message: "Domain added." };
  } catch {
    return { error: "The domain could not be saved." };
  }
}

export async function removeOrgVendorDomainAction(
  _previous: Result,
  formData: FormData
): Promise<VendorDomainsActionState> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const parsedId = idSchema.safeParse(formData.get("id"));
  if (!parsedId.success) return { error: "The domain could not be removed." };

  try {
    const result = await createAdminClient()
      .from("org_research_vendor_domains")
      .delete()
      .eq("id", parsedId.data)
      .eq("organization_id", session.organizationId)
      .select("id")
      .maybeSingle();
    if (result.error) return { error: "The domain could not be removed." };
    if (!result.data) return { error: "That domain was not found." };

    await recordAudit(
      session,
      "org_vendor_domain.removed",
      session.organizationId
    );
    revalidatePath("/admin/vendor-domains");
    return { success: true, message: "Domain removed." };
  } catch {
    return { error: "The domain could not be removed." };
  }
}
