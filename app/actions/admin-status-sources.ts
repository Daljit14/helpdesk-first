"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isServiceHealthEnabled } from "@/lib/admin/flags";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sanitizeServiceText,
  validateStatusBaseUrl,
} from "@/lib/service-health/url";

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 20 },
  "service-health-status-sources"
);
const addSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    baseUrl: z.string().trim().min(1).max(2048),
  })
  .strict();
const idSchema = z.string().uuid();

export type StatusSourceActionState = { success: true } | { error: string };
type Result = StatusSourceActionState | null;
type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

async function sessionOrError(): Promise<Session | StatusSourceActionState> {
  if (!isServiceHealthEnabled())
    return { error: "Service health is disabled." };
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
    return { error: "Too many status-page requests." };
  return session;
}

export async function addStatusSourceAction(
  _previous: Result,
  formData: FormData
): Promise<StatusSourceActionState> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    baseUrl: formData.get("baseUrl"),
  });
  if (!parsed.success)
    return { error: "Enter a name and valid HTTPS status URL." };
  const baseUrl = validateStatusBaseUrl(parsed.data.baseUrl);
  const name = sanitizeServiceText(parsed.data.name, 80);
  if (!baseUrl || !name)
    return { error: "Enter a name and valid HTTPS status URL." };

  const admin = createAdminClient();
  const count = await admin
    .from("org_status_sources")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organizationId);
  if (count.error || count.count === null)
    return { error: "Status pages could not be loaded." };
  if (count.count >= 10)
    return { error: "A maximum of 10 status pages is allowed." };

  const result = await admin.from("org_status_sources").insert({
    organization_id: session.organizationId,
    name,
    base_url: baseUrl,
    enabled: true,
    created_by: session.userId,
  });
  if (result.error)
    return {
      error:
        result.error.code === "23505"
          ? "That status page is already added."
          : "Status page could not be added.",
    };
  await recordAudit(session, "service_health.status_source_added", name);
  revalidatePath("/admin/connectors");
  return { success: true };
}

export async function removeStatusSourceAction(
  _previous: Result,
  formData: FormData
): Promise<StatusSourceActionState> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid status page." };
  const result = await createAdminClient()
    .from("org_status_sources")
    .delete()
    .eq("id", id.data)
    .eq("organization_id", session.organizationId);
  if (result.error) return { error: "Status page could not be removed." };
  await recordAudit(session, "service_health.status_source_removed", id.data);
  revalidatePath("/admin/connectors");
  return { success: true };
}
