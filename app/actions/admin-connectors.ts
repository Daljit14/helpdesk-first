"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { sealSecret } from "@/lib/security/secret-box";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 20 },
  "connector-actions"
);
const inputSchema = z.object({
  provider: z.enum(["entra", "google"]),
  tenantId: z.string().trim().max(128).optional(),
  clientId: z.string().trim().max(128).optional(),
  clientSecret: z.string().max(5000).optional(),
  serviceAccountJson: z.string().max(20_000).optional(),
  adminSubject: z.string().email().optional(),
  allowedGroupIds: z
    .array(z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/))
    .max(20),
  resetUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
});
type Result = { success: true } | { error: string };
type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;
async function sessionOrError(): Promise<Session | Result> {
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
    return { error: "Too many connector requests." };
  return session;
}
export async function saveConnectorAction(input: unknown): Promise<Result> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const valueInput =
    input instanceof FormData
      ? {
          provider: input.get("provider"),
          tenantId: input.get("tenantId") || undefined,
          clientId: input.get("clientId") || undefined,
          clientSecret: input.get("clientSecret") || undefined,
          serviceAccountJson: input.get("serviceAccountJson") || undefined,
          adminSubject: input.get("adminSubject") || undefined,
          allowedGroupIds: String(input.get("allowedGroupIds") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          resetUrl: input.get("resetUrl") || undefined,
        }
      : input;
  const parsed = inputSchema.safeParse(valueInput);
  if (!parsed.success) return { error: "Invalid connector settings." };
  const value = parsed.data;
  if (
    value.provider === "entra" &&
    (!value.tenantId || !value.clientId || !value.clientSecret)
  )
    return { error: "Entra tenant, client, and secret are required." };
  if (
    value.provider === "google" &&
    (!value.serviceAccountJson || !value.adminSubject)
  )
    return { error: "Google service account and admin subject are required." };
  if (value.provider === "google") {
    try {
      const credentials = JSON.parse(value.serviceAccountJson ?? "") as {
        client_email?: unknown;
        private_key?: unknown;
      };
      if (
        typeof credentials.client_email !== "string" ||
        typeof credentials.private_key !== "string"
      ) {
        return { error: "Google service account JSON is invalid." };
      }
    } catch {
      return { error: "Google service account JSON is invalid." };
    }
  }
  const secret =
    value.provider === "entra"
      ? (value.clientSecret ?? "")
      : (value.serviceAccountJson ?? "");
  const result = await createAdminClient()
    .from("organization_connectors")
    .upsert(
      {
        organization_id: session.organizationId,
        provider: value.provider,
        config:
          value.provider === "entra"
            ? { tenantId: value.tenantId, clientId: value.clientId }
            : { adminSubject: value.adminSubject },
        secret_ciphertext: sealSecret(secret),
        key_id: "v1",
        allowed_group_ids: value.allowedGroupIds,
        reset_url: value.resetUrl ?? null,
        status: "active",
        updated_at: new Date().toISOString(),
        created_by: session.userId,
      },
      { onConflict: "organization_id" }
    );
  if (result.error) return { error: "Connector could not be saved." };
  await recordAudit(session, "connector.saved", value.provider);
  revalidatePath("/admin/connectors");
  return { success: true };
}
export async function testConnectorAction(): Promise<Result> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const admin = createAdminClient();
  const loaded = await loadDirectoryForOrganization(
    admin,
    session.organizationId
  );
  if (!loaded) return { error: "No connector configured." };
  const health = await loaded.directory.health(AbortSignal.timeout(8_000));
  const update = await admin
    .from("organization_connectors")
    .update({
      last_health_at: new Date().toISOString(),
      last_health_ok: health.ok,
      status: health.ok ? "active" : "error",
    })
    .eq("organization_id", session.organizationId);
  if (update.error) return { error: "Connector health could not be saved." };
  await recordAudit(session, "connector.tested", loaded.config.provider);
  if (!health.ok) return { error: "Connector health check failed." };
  revalidatePath("/admin/connectors");
  return { success: true };
}
export async function disableConnectorAction(): Promise<Result> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const result = await createAdminClient()
    .from("organization_connectors")
    .update({ status: "disabled" })
    .eq("organization_id", session.organizationId);
  if (result.error) return { error: "Connector could not be disabled." };
  await recordAudit(session, "connector.disabled", session.organizationId);
  revalidatePath("/admin/connectors");
  return { success: true };
}
