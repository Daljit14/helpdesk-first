"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="px-6 py-8">
      <div className="glass mx-auto grid max-w-6xl gap-8 p-6 md:grid-cols-4">
        <div>
          <p className="font-semibold">HelpDesk First</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Level-1 IT help for schools and organizations.
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">Get help</p>
          <Link href="/">Search guides</Link>
          <Link href="/assistant">Ask the assistant</Link>
          <Link href="/tickets">My tickets</Link>
          <Link href="/status">Status</Link>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">Organization</p>
          <Link href="/admin/login">Staff login</Link>
          <Link href="/admin/organization">Organization admin</Link>
          <Link href="/admin/notifications">Notifications</Link>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">Legal &amp; safety</p>
          <p className="text-muted-foreground">
            Level-1 guidance only. Contact your IT team for managed devices or
            anything outside your authority.
          </p>
        </div>
        <div className="border-t border-border/60 pt-4 text-sm text-muted-foreground md:col-span-4">
          © 2026 HelpDesk First
        </div>
      </div>
    </footer>
  );
}
