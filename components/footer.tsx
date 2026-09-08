"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const currentYear = new Date().getFullYear();
const linkClassName =
  "text-muted-foreground hover:text-foreground hover:underline underline-offset-4";

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
          <p className="font-medium text-foreground">Get help</p>
          <Link className={linkClassName} href="/">
            Search guides
          </Link>
          <Link className={linkClassName} href="/assistant">
            Ask the assistant
          </Link>
          <Link className={linkClassName} href="/tickets">
            My tickets
          </Link>
          <Link className={linkClassName} href="/status">
            Status
          </Link>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium text-foreground">Organization</p>
          <Link className={linkClassName} href="/admin/login">
            Staff login
          </Link>
          <Link className={linkClassName} href="/admin/organization">
            Organization admin
          </Link>
          <Link className={linkClassName} href="/admin/notifications">
            Notifications
          </Link>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium text-foreground">Legal &amp; safety</p>
          <p className="text-muted-foreground">
            Level-1 guidance only. Contact your IT team for managed devices or
            anything outside your authority.
          </p>
        </div>
        <div className="border-t border-border/60 pt-4 text-sm text-muted-foreground md:col-span-4">
          © {currentYear} HelpDesk First
        </div>
      </div>
    </footer>
  );
}
