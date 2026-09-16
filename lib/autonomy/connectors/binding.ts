import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  IdentityDirectory,
  IdentityBinding,
  ConnectorResult,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function bindRequesterIdentity(
  admin: Admin,
  directory: IdentityDirectory,
  input: {
    runId: string;
    ticketId: string;
    organizationId: string;
    userId: string;
  }
): Promise<ConnectorResult<IdentityBinding>> {
  const user = await admin.auth.admin.getUserById(input.userId);
  const email = user.data.user?.email?.trim().toLowerCase();
  if (
    user.error ||
    !user.data.user ||
    !email ||
    !user.data.user.email_confirmed_at
  ) {
    return {
      ok: false,
      error: {
        kind: "unauthorized",
        message: "Requester email is not verified",
      },
    };
  }
  const at = email.lastIndexOf("@");
  if (at < 1)
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Requester email is invalid",
      },
    };
  const domain = email.slice(at + 1);
  const verified = await admin
    .from("organization_domains")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("domain", domain)
    .eq("verified", true)
    .maybeSingle();
  if (verified.error || !verified.data) {
    return {
      ok: false,
      error: {
        kind: "unauthorized",
        message: "Requester domain is not verified",
      },
    };
  }
  const lookup = await directory.lookupUserByEmail(
    email,
    AbortSignal.timeout(8000)
  );
  if (!lookup.ok) return lookup;
  if (lookup.value.primaryEmail.toLowerCase() !== email) {
    return {
      ok: false,
      error: {
        kind: "unauthorized",
        message: "Directory identity does not match requester",
      },
    };
  }
  const binding: IdentityBinding = {
    ...input,
    provider: directory.provider,
    directoryUserId: lookup.value.directoryUserId,
    matchedEmailHash: hashEmail(email),
    boundAt: new Date().toISOString(),
  };
  const inserted = await admin.from("identity_bindings").insert({
    run_id: binding.runId,
    ticket_id: binding.ticketId,
    organization_id: binding.organizationId,
    user_id: binding.userId,
    provider: binding.provider,
    directory_user_id: binding.directoryUserId,
    matched_email_hash: binding.matchedEmailHash,
    bound_at: binding.boundAt,
  });
  if (inserted.error)
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Identity binding could not be stored",
      },
    };
  return { ok: true, value: binding };
}

export async function getIdentityBinding(
  admin: Admin,
  runId: string
): Promise<IdentityBinding | null> {
  const result = await admin
    .from("identity_bindings")
    .select(
      "run_id,ticket_id,organization_id,user_id,provider,directory_user_id,matched_email_hash,bound_at"
    )
    .eq("run_id", runId)
    .order("bound_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as {
    run_id: string;
    ticket_id: string;
    organization_id: string;
    user_id: string;
    provider: IdentityBinding["provider"];
    directory_user_id: string;
    matched_email_hash: string;
    bound_at: string;
  };
  return {
    runId: row.run_id,
    ticketId: row.ticket_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    provider: row.provider,
    directoryUserId: row.directory_user_id,
    matchedEmailHash: row.matched_email_hash,
    boundAt: row.bound_at,
  };
}
