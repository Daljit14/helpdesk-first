import { z } from "zod";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";
import { getAttachmentPolicy } from "@/lib/attachments/policy";

const attachmentIdSchema = z.string().uuid();

function resultError(error: string) {
  return { error };
}

export async function attachTicketAttachments(
  ticketId: string,
  attachmentIds: string[]
): Promise<{ error: string } | { success: true }> {
  if (!isSecureAttachmentsEnabled()) return { success: true };
  const user = await getCurrentUser();
  if (!user) return resultError("Not authorized.");
  const ids = [...new Set(attachmentIds)].filter(
    (id) => attachmentIdSchema.safeParse(id).success
  );
  if (ids.length === 0) return { success: true };
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id,organization_id,user_id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket) return resultError("Ticket not found.");
  const policy = await getAttachmentPolicy(ticket.organization_id);
  const { data: existing } = await admin
    .from("ticket_attachments")
    .select("id")
    .eq("ticket_id", ticketId)
    .in("status", ["uploading", "scanning", "ready"]);
  if ((existing?.length ?? 0) + ids.length > policy.maxFilesPerTicket)
    return resultError("Too many attachments.");
  const { data: attached, error } = await admin
    .from("ticket_attachments")
    .update({
      ticket_id: ticketId,
      organization_id: ticket.organization_id,
      updated_at: new Date().toISOString(),
    })
    .eq("uploader_id", user.id)
    .is("ticket_id", null)
    .eq("status", "ready")
    .in("id", ids)
    .select("id");
  if (error || attached?.length !== ids.length)
    return resultError("Only ready attachments can be attached.");
  return { success: true };
}

export async function listOwnAttachments(ticketId: string) {
  const user = await getCurrentUser();
  if (!user || !isSecureAttachmentsEnabled()) return [];
  const { data } = await createAdminClient()
    .from("ticket_attachments")
    .select(
      "id,original_name,byte_size,status,detected_mime,scan_verdict,created_at,width,height,page_count,rejection_reason"
    )
    .eq("ticket_id", ticketId)
    .eq("uploader_id", user.id)
    .order("created_at", { ascending: true });
  return data ?? [];
}
