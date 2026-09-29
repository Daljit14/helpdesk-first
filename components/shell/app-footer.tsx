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
    <footer className="border-t border-border px-4 py-6 text-sm sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 font-medium text-muted-foreground">
        <span>© 2026 HelpDesk First</span>
        <Link href="/browse" className="rounded-md hover:text-primary">
          Browse solutions
        </Link>
        <Link href="/status" className="rounded-md hover:text-primary">
          System status
        </Link>
        {signedIn ? (
          <>
            <Link href="/assistant" className="rounded-md hover:text-primary">
              New ticket
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className="rounded-md hover:text-primary">
              Log in
            </Link>
            <Link href="/signup" className="rounded-md hover:text-primary">
              Sign up
            </Link>
          </>
        )}
        {staff && (
          <Link href="/admin/login" className="rounded-md hover:text-primary">
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
