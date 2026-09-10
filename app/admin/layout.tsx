import type { Metadata } from "next";
import Link from "next/link";
import { adminLogout } from "@/app/actions/admin-auth";
import { adminRoleLabel, getAdminSession } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import {
  isKnowledgeGovernanceEnabled,
  isSecureAttachmentsEnabled,
} from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/v2/admin-shell";
import { buildDepartments } from "@/components/admin/v2/departments";
import { isUiV2Enabled } from "@/lib/ui-v2";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function LegacyAdminLayout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Awaited<ReturnType<typeof getAdminSession>>;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-3 z-40 px-4">
        <div className="glass-pill glass-pill--solid mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-2.5">
          <Link href="/admin/operations" className="font-semibold">
            HelpDesk First · Operations
          </Link>
          <div className="flex w-full flex-wrap items-center gap-4 text-sm md:w-auto">
            <AdminThemeToggle />
            {session && (
              <div className="flex w-full flex-wrap items-center gap-4 md:w-auto">
                <span
                  className="glass-pill px-3 py-1"
                  title="Your role in this organization"
                >
                  {adminRoleLabel(session.role, session.isPlatformAdmin)}
                </span>
                <nav className="flex flex-wrap gap-1 [&_a]:whitespace-nowrap">
                  <Link
                    className="rounded-full px-3 py-2 hover:bg-muted"
                    href="/admin/operations"
                  >
                    Operations
                  </Link>
                  {isKnowledgeGovernanceEnabled() && (
                    <Link
                      className="whitespace-nowrap rounded-full px-3 py-2 hover:bg-muted"
                      href="/admin/knowledge"
                    >
                      Knowledge
                    </Link>
                  )}
                  <Link
                    className="rounded-full px-3 py-2 hover:bg-muted"
                    href="/admin/operations#tickets"
                  >
                    Tickets
                  </Link>
                  <Link
                    className="rounded-full px-3 py-2 hover:bg-muted"
                    href="/admin/notifications"
                  >
                    Notifications
                  </Link>
                  {session.role === "org_admin" && (
                    <Link
                      className="rounded-full px-3 py-2 hover:bg-muted"
                      href="/admin/organization"
                    >
                      Organization
                    </Link>
                  )}
                  {session.isPlatformAdmin && (
                    <Link
                      className="rounded-full px-3 py-2 hover:bg-muted"
                      href="/admin/organizations"
                    >
                      Organizations
                    </Link>
                  )}
                  {isSecureAttachmentsEnabled() && (
                    <Link
                      className="rounded-full px-3 py-2 hover:bg-muted"
                      href="/admin/attachments"
                    >
                      Attachments
                    </Link>
                  )}
                </nav>
                <form action={adminLogout}>
                  <Button type="submit" variant="outline" size="sm">
                    Logout
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!isUiV2Enabled() || !session) {
    return <LegacyAdminLayout session={session}>{children}</LegacyAdminLayout>;
  }

  const admin = createAdminClient();
  const [{ data: organization }, notificationResult] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", session.organizationId)
      .maybeSingle(),
    admin
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .in("status", ["failed", "dead"]),
  ]);
  const departments = buildDepartments(session, {
    knowledgeGovernanceEnabled: isKnowledgeGovernanceEnabled(),
    secureAttachmentsEnabled: isSecureAttachmentsEnabled(),
  });

  return (
    <AdminShell
      departments={departments}
      organizationName={organization?.name ?? "Organization"}
      roleLabel={adminRoleLabel(session.role, session.isPlatformAdmin)}
      isPlatformAdmin={session.isPlatformAdmin}
      pendingNotifications={
        notificationResult.error ? 0 : (notificationResult.count ?? 0)
      }
    >
      {children}
    </AdminShell>
  );
}
