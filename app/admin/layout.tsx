import type { Metadata } from "next";
import Link from "next/link";
import { adminLogout } from "@/app/actions/admin-auth";
import { getAdminSession } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";

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
        <div className="glass-pill mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-2.5">
          <Link href="/admin/operations" className="font-semibold">
            HelpDesk First · Operations
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <AdminThemeToggle />
            {session && (
              <>
              <span className="glass-pill px-3 py-1">
                {session.role}
              </span>
              <nav className="flex gap-1">
                <Link className="rounded-full px-3 py-2 hover:bg-muted" href="/admin/operations">Operations</Link>
                <Link className="rounded-full px-3 py-2 hover:bg-muted" href="/admin/operations#tickets">Tickets</Link>
              </nav>
              <AdminThemeToggle />
              <form action={adminLogout}>
                <Button type="submit" variant="outline" size="sm">
                  Logout
                </Button>
              </form>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
