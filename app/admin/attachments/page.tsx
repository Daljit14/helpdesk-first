import type { Metadata } from "next";
import {
  AlertTriangle,
  Clock,
  FileText,
  Paperclip,
  ShieldCheck,
  Timer,
  Upload,
} from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";
import { getAttachmentPolicy } from "@/lib/attachments/policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttachmentPolicyForm } from "@/components/admin/attachment-policy-form";
import { decryptAttachmentRow } from "@/lib/security/ticket-crypto";
import {
  AdminHero,
  AdminPage,
  EmptyState,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Attachments",
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<string, StatTone> = {
  rejected: "danger",
  scanning: "info",
  unscanned: "warn",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024)
    return `${Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10} GB`;
  if (bytes >= 1024 * 1024)
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default async function AdminAttachmentsPage() {
  if (!isSecureAttachmentsEnabled()) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const session = await requireAdminPage("/admin/attachments");
  const policy = await getAttachmentPolicy(session.organizationId);
  const admin = createAdminClient();
  const { data: rawRecent } = await admin
    .from("ticket_attachments")
    .select(
      "id,organization_id,original_name,status,scan_detail,rejection_reason,created_at"
    )
    .eq("organization_id", session.organizationId)
    .in("status", ["rejected", "scanning", "unscanned"])
    .order("created_at", { ascending: false })
    .limit(25);
  const recent = await Promise.all(
    (rawRecent ?? []).map((row) => decryptAttachmentRow(admin, row))
  );
  const rows = recent ?? [];
  const rejected = rows.filter((row) => row.status === "rejected").length;
  const inReview = rows.length - rejected;
  return (
    <AdminPage>
      <AdminHero
        eyebrow="Administration"
        title="Attachment policy"
        description="Secure uploads are quarantined, inspected, and stored privately."
        icon={Paperclip}
        tone="rose"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Files per ticket" value={policy.maxFilesPerTicket} />
          <HeroChip label="Max file" value={formatBytes(policy.maxFileBytes)} />
          <HeroChip
            label="Allowed types"
            value={policy.allowedMimeTypes.length}
          />
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Rejected files"
          value={rejected}
          icon={AlertTriangle}
          tone="danger"
          index={0}
          hint="in the latest 25 issues"
        />
        <StatTile
          label="Scanning or unscanned"
          value={inReview}
          icon={Clock}
          tone="warn"
          index={1}
        />
        <StatTile
          label="Max total per ticket"
          value={formatBytes(policy.maxTotalBytes)}
          icon={Upload}
          tone="info"
          index={2}
        />
        <StatTile
          label="Retention"
          value={policy.retentionDays}
          suffix=" days"
          icon={Timer}
          tone="good"
          index={3}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel
          title="Upload limits"
          description="Limits apply to every new file employees and agents attach."
          icon={ShieldCheck}
          delay={0.1}
        >
          <AttachmentPolicyForm
            organizationId={session.organizationId}
            policy={policy}
          />
        </Panel>
        <Panel
          title="Recent rejected or scanning files"
          icon={FileText}
          delay={0.15}
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No recent issues."
              body="Rejected or still-scanning uploads will be listed here."
            />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {rows.map((attachment) => (
                <li
                  key={attachment.id}
                  className="hf-adm-row flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6"
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <Paperclip
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate">{attachment.original_name}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <StatusPill
                      tone={STATUS_TONE[attachment.status] ?? "neutral"}
                      pulse={attachment.status === "scanning"}
                    >
                      {attachment.status}
                    </StatusPill>
                    {attachment.rejection_reason && (
                      <span className="text-xs font-semibold">
                        {attachment.rejection_reason}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
