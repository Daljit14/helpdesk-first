import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/auth";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";
import { getAttachmentPolicy } from "@/lib/attachments/policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttachmentPolicyForm } from "@/components/admin/attachment-policy-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Attachments",
  robots: { index: false, follow: false },
};

export default async function AdminAttachmentsPage() {
  if (!isSecureAttachmentsEnabled()) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const session = await requireAdminPage("/admin/attachments");
  const policy = await getAttachmentPolicy(session.organizationId);
  const { data: recent } = await createAdminClient()
    .from("ticket_attachments")
    .select("id,original_name,status,rejection_reason,created_at")
    .eq("organization_id", session.organizationId)
    .in("status", ["rejected", "scanning", "unscanned"])
    .order("created_at", { ascending: false })
    .limit(25);
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Attachment policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure uploads are quarantined, inspected, and stored privately.
        </p>
        <div className="mt-6">
          <AttachmentPolicyForm
            organizationId={session.organizationId}
            policy={policy}
          />
        </div>
        <div className="glass-strong mt-6 p-5">
          <h2 className="font-semibold">Recent rejected or scanning files</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(recent ?? []).map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-2 last:border-0"
              >
                <span>{attachment.original_name}</span>
                <span className="text-muted-foreground">
                  {attachment.status}
                  {attachment.rejection_reason
                    ? ` · ${attachment.rejection_reason}`
                    : ""}
                </span>
              </li>
            ))}
            {(recent ?? []).length === 0 && (
              <li className="text-muted-foreground">No recent issues.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
