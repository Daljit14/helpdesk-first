"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-border/60 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <p className="text-sm text-muted-foreground">
          <strong>Disclaimer:</strong> HelpDesk First provides Level-1 IT
          support guidance only. Not every problem can be resolved with
          self-service steps; follow your organization&apos;s safety policies
          and contact your IT team when instructions involve managed devices,
          shared networks, or anything outside your authority.
        </p>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} HelpDesk First. All rights
            reserved.
          </p>
          <Link
            href="/admin/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  );
}
