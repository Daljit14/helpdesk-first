import { createHash, randomBytes } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createVerificationLink(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    runId: string;
    ticketId: string;
    organizationId: string;
    userId: string;
  }
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const inserted = await admin.from("verification_links").insert({
    token_hash: hashToken(token),
    run_id: input.runId,
    ticket_id: input.ticketId,
    organization_id: input.organizationId,
    user_id: input.userId,
    expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  });
  if (inserted.error) throw new Error("Could not create verification link");
  return `/verify/${token}`;
}
