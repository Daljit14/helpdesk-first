import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IdentityEvidence } from "./types";

const FAMILY =
  /(log ?in|sign ?in|password|locked|access|canvas|self.?service|sso|mfa|authenticat)/i;
export function isIdentityFamily(
  category: string | null,
  message: string | null
): boolean {
  return (
    /(accounts?|email|login|access)/i.test(category ?? "") ||
    FAMILY.test(message ?? "")
  );
}
export async function loadIdentityEvidence(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    runId: string;
    ticketId: string;
    organizationId: string;
    userId: string;
    category: string | null;
    message: string | null;
  }
): Promise<IdentityEvidence | undefined> {
  if (!isIdentityFamily(input.category, input.message)) return undefined;
  if (!process.env.HELP_DESK_CONNECTOR_KEY) {
    return {
      provider: "google",
      status: null,
      error: "unavailable",
      checkedAt: new Date().toISOString(),
    };
  }
  const loaded = await loadDirectoryForOrganization(
    admin,
    input.organizationId
  );
  if (!loaded)
    return {
      provider: "google",
      status: null,
      error: "unavailable",
      checkedAt: new Date().toISOString(),
    };
  const user = await admin.auth.admin.getUserById(input.userId);
  const authUser = user.data.user;
  const email = authUser?.email;
  if (!email)
    return {
      provider: loaded.config.provider,
      status: null,
      error: "not_found",
      checkedAt: new Date().toISOString(),
    };
  const at = email.lastIndexOf("@");
  if (at < 1)
    return {
      provider: loaded.config.provider,
      status: null,
      error: "invalid_response",
      checkedAt: new Date().toISOString(),
    };
  const domain = await admin
    .from("organization_domains")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("domain", email.slice(at + 1).toLowerCase())
    .eq("verified", true)
    .maybeSingle();
  if (domain.error || !domain.data || !authUser?.email_confirmed_at)
    return {
      provider: loaded.config.provider,
      status: null,
      error: "unauthorized",
      checkedAt: new Date().toISOString(),
    };
  const status = await loaded.directory.lookupUserByEmail(
    email,
    AbortSignal.timeout(8000)
  );
  return status.ok
    ? {
        provider: loaded.config.provider,
        status: status.value,
        error: null,
        checkedAt: new Date().toISOString(),
      }
    : {
        provider: loaded.config.provider,
        status: null,
        error: status.error.kind,
        checkedAt: new Date().toISOString(),
      };
}
