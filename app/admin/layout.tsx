import type { Metadata } from "next";
import Link from "next/link";
import { adminLogout } from "@/app/actions/admin-auth";
import { getAdminSession } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";

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
    <div className="flex min-h-full flex-1 flex-col bg-white text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/admin/operations" className="font-semibold">
            HelpDesk First · Operations
          </Link>
          {session && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="rounded-full bg-slate-700 px-3 py-1">
                {session.role}
              </span>
              <nav className="flex gap-3">
                <Link href="/admin/operations">Operations</Link>
                <Link href="/admin/operations#tickets">Tickets</Link>
              </nav>
              <form action={adminLogout}>
                <Button type="submit" variant="outline" size="sm">
                  Logout
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
