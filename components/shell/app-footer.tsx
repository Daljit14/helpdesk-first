"use client";

import Link from "next/link";

export function AppFooter({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  return (
    <footer className="border-t border-border bg-card px-4 py-4 text-sm sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
        <span>© 2026 HelpDesk First</span>
        <Link href="/browse" className="hover:text-foreground">
          Browse solutions
        </Link>
        <Link href="/status" className="hover:text-foreground">
          System status
        </Link>
        {signedIn ? (
          <>
            <Link href="/assistant" className="hover:text-foreground">
              New ticket
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </>
        )}
        {staff && (
          <Link href="/admin/login" className="hover:text-foreground">
            Staff log in
          </Link>
        )}
        <span className="basis-full text-xs">
          Level-1 guidance only — for managed devices or anything outside your
          authority, contact your IT team.
        </span>
      </div>
    </footer>
  );
}
