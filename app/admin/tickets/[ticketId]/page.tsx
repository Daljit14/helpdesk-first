import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketUpdateForm } from "@/components/admin/ticket-update-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit, requireAdminPage } from "@/lib/admin/auth";
import {
  categoryLabel,
  normalizePlatform,
  normalizePriority,
  normalizeStatus,
  slaDue,
  toTicketId,
} from "@/lib/operations/transform";
import { isResolutionTrackingEnabled } from "@/lib/admin/flags";
import { getIssueBySlug } from "@/lib/search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ticket detail",
  robots: { index: false, follow: false },
};

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const session = await requireAdminPage(`/admin/tickets/${ticketId}`);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ticketId
    )
      ? ticketId
      : null;
  if (!uuid) notFound();

  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("tickets")
    .select(
      "id, issue_id, issue_title, category, status, priority, assigned_agent, platform, created_at, updated_at, first_response_at, resolved_at, attachment_path, message, resolution_source, ai_attempted, ai_attempted_at, ai_recommended_issue_id, escalated, escalated_at, escalation_reason, resolution_summary, user_confirmed, user_confirmed_at"
    )
    .eq("organization_id", session.organizationId)
    .eq("id", uuid)
    .maybeSingle();
  if (error || !ticket) notFound();

  const { data: events } = await admin
    .from("ticket_events")
    .select("event_type, from_value, to_value, created_at")
    .eq("organization_id", session.organizationId)
    .eq("ticket_id", uuid)
    .order("created_at", { ascending: true });
  let attachmentUrl: string | null = null;
  if (ticket.attachment_path) {
    const signed = await admin.storage
      .from("ticket-attachments")
      .createSignedUrl(ticket.attachment_path, 60);
    attachmentUrl = signed.data?.signedUrl ?? null;
  }
  await recordAudit(session, "ticket.view_detail", uuid);
  const status = normalizeStatus(ticket.status);
  const priority = normalizePriority(ticket.priority);
  const due = slaDue(ticket.created_at, priority);
  const resolutionTrackingEnabled = isResolutionTrackingEnabled();
  const recommendedIssue = ticket.ai_recommended_issue_id
    ? getIssueBySlug(ticket.ai_recommended_issue_id)
    : null;

  return (
    <section className="flex flex-1 flex-col bg-white px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <p className="font-mono text-sm text-slate-500">
          {toTicketId(ticket.id)}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{ticket.issue_title}</h1>
        <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <p>Status: {status}</p>
          <p>Priority: {priority}</p>
          <p>Category: {ticket.category ?? categoryLabel(ticket.issue_id)}</p>
          <p>Platform: {normalizePlatform(ticket.platform)}</p>
          <p>Agent: {ticket.assigned_agent ?? "Unassigned"}</p>
          <p>SLA due: {new Date(due).toLocaleString()}</p>
          <p>Created: {new Date(ticket.created_at).toLocaleString()}</p>
          <p>
            Updated:{" "}
            {new Date(ticket.updated_at ?? ticket.created_at).toLocaleString()}
          </p>
        </div>
        <TicketUpdateForm
          ticketId={uuid}
          status={status}
          priority={priority}
          assignedAgent={ticket.assigned_agent ?? ""}
          resolutionTrackingEnabled={resolutionTrackingEnabled}
          resolutionSummary={ticket.resolution_summary ?? ""}
        />
        {resolutionTrackingEnabled && (
          <div className="mt-6 rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold">Resolution</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Resolved by</dt>
                <dd>
                  {ticket.resolution_source === "ai"
                    ? "AI assistant"
                    : ticket.resolution_source === "agent"
                      ? "Support agent"
                      : ticket.resolution_source === "self_service"
                        ? "Self-service"
                        : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">AI attempted</dt>
                <dd>
                  {ticket.ai_attempted ? "Yes" : "No"}
                  {ticket.ai_attempted_at
                    ? ` · ${new Date(ticket.ai_attempted_at).toLocaleString()}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Recommended guide</dt>
                <dd>{recommendedIssue?.title ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium">Escalated</dt>
                <dd>
                  {ticket.escalated ? "Yes" : "No"}
                  {ticket.escalated_at
                    ? ` · ${new Date(ticket.escalated_at).toLocaleString()}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Escalation reason</dt>
                <dd>{ticket.escalation_reason ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium">User confirmed</dt>
                <dd>
                  {ticket.user_confirmed && ticket.user_confirmed_at
                    ? new Date(ticket.user_confirmed_at).toLocaleString()
                    : "Not confirmed"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium">Resolution summary</dt>
                <dd>{ticket.resolution_summary ?? "—"}</dd>
              </div>
            </dl>
          </div>
        )}
        <div className="mt-6 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-wrap text-slate-700">
            {ticket.message}
          </p>
          {attachmentUrl && (
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block underline underline-offset-4"
            >
              Open attachment (link valid 60 s)
            </a>
          )}
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold">Timeline</h2>
          <ol className="mt-4 space-y-3">
            {(events ?? []).map((event, index) => (
              <li key={`${event.created_at}-${index}`} className="text-sm">
                <span className="font-medium">{event.event_type}</span>
                <span className="ml-2 text-slate-500">
                  {event.from_value ? `${event.from_value} → ` : ""}
                  {event.to_value ?? ""}
                  {" · "}
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
