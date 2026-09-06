"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { isAdminDashboardEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdateTicketState = {
  error?: string;
  success?: string;
} | null;

const updateTicketSchema = z
  .object({
    ticketId: z.string().uuid(),
    status: z.enum(["New", "In Progress", "Waiting", "Resolved", "Closed"]),
    priority: z.enum(["Low", "Normal", "High", "Urgent"]),
    assignedAgent: z.string().trim().max(80),
  })
  .strict();

export async function updateTicket(
  _prev: UpdateTicketState,
  formData: FormData
): Promise<UpdateTicketState> {
  if (!isAdminDashboardEnabled()) return { error: "Not available." };

  const session = await getAdminSession();
  if (!session) return { error: "Not authorized." };

  const parsed = updateTicketSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assignedAgent: formData.get("assignedAgent"),
  });
  if (!parsed.success) return { error: "Invalid ticket update." };

  const { ticketId, status, priority, assignedAgent } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tickets")
    .update({
      status,
      priority,
      assigned_agent: assignedAgent || null,
    })
    .eq("id", ticketId)
    .eq("organization_id", session.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Ticket not found." };

  await recordAudit(session, "ticket.update", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: "Ticket updated." };
}
