import { notFound } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, Clock, Inbox } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { getNotificationOutbox } from "@/app/actions/notifications";
import { NotificationOutbox } from "@/components/admin/notification-outbox";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";

function summarize(rows: { status: string }[]) {
  const count = (...statuses: string[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;
  return {
    total: rows.length,
    pending: count("pending", "sending"),
    sent: count("sent"),
    failed: count("failed", "dead"),
    dead: count("dead"),
  };
}

export default async function NotificationsPage() {
  const session = await requireAdminPage("/admin/notifications");
  if (!session) notFound();
  const rows = await getNotificationOutbox(session.organizationId);
  if (!rows) notFound();
  const stats = summarize(rows);
  const deliveryRate = stats.total > 0 ? stats.sent / stats.total : 0;
  return (
    <AdminPage>
      <AdminHero
        eyebrow="Data & security"
        title="Notifications"
        description="Pending, sent, and dead outbox notifications."
        icon={Bell}
        tone="sunset"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="In outbox" value={stats.total} />
          <HeroChip
            label="Waiting"
            value={stats.pending}
            pulse={stats.pending > 0}
          />
          <HeroChip label="Dead" value={stats.dead} />
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Total"
          value={stats.total}
          icon={Inbox}
          index={0}
          hint="latest 200 notifications"
        />
        <StatTile
          label="Pending"
          value={stats.pending}
          icon={Clock}
          tone="warn"
          index={1}
          hint="pending or sending"
        />
        <StatTile
          label="Sent"
          value={stats.sent}
          icon={CheckCircle2}
          tone="good"
          index={2}
          progress={deliveryRate}
          hint={`${Math.round(deliveryRate * 100)}% delivered`}
        />
        <StatTile
          label="Failed or dead"
          value={stats.failed}
          icon={AlertTriangle}
          tone="danger"
          index={3}
        />
      </StatGrid>

      <Panel
        title="Outbox"
        description="Filter by status and replay dead notifications."
        icon={Bell}
        delay={0.1}
      >
        <NotificationOutbox
          rows={rows}
          canReplay={session.role === "org_admin"}
        />
      </Panel>
    </AdminPage>
  );
}
