"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditVersions } from "@/lib/autonomy/audit/versions";

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["agree", "disagree", "unsafe"]),
  note: z.string().trim().max(2000),
});

export async function reviewShadowDecision(
  input: unknown
): Promise<{ success: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  const value =
    input instanceof FormData
      ? {
          id: input.get("id"),
          status: input.get("status"),
          note: input.get("note") ?? "",
        }
      : input;
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success) return { error: "Invalid review." };
  const admin = createAdminClient();
  const updated = await admin
    .from("shadow_decisions")
    .update({
      review_status: parsed.data.status,
      review_note: parsed.data.note || null,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", session.organizationId)
    .select("id,run_id,ticket_id")
    .maybeSingle();
  if (updated.error || !updated.data)
    return { error: "Shadow decision not found." };
  await admin.from("resolution_events").insert({
    organization_id: session.organizationId,
    run_id: updated.data.run_id,
    ticket_id: updated.data.ticket_id,
    kind: "shadow.reviewed",
    actor: session.email,
    initiated_by: "human",
    versions: auditVersions(),
    detail: {
      id: parsed.data.id,
      status: parsed.data.status,
      note: parsed.data.note || null,
    },
  });
  revalidatePath("/admin/resolution/shadow");
  return { success: true };
}
