import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { getNotificationOutbox } from "@/app/actions/notifications";
import { NotificationOutbox } from "@/components/admin/notification-outbox";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireAdminPage("/admin/notifications");
  if (!session) notFound();
  const rows = await getNotificationOutbox(session.organizationId);
  if (!rows) notFound();
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold">Notifications</h1>
      <p className="mt-2 text-muted-foreground">
        Pending, sent, and dead outbox notifications.
      </p>
      <div className="mt-8">
        <NotificationOutbox
          rows={rows}
          canReplay={session.role === "org_admin"}
        />
      </div>
    </main>
  );
}
