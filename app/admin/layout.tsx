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

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
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
