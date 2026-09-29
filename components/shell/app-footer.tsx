"use client";

import Link from "next/link";
import { BrandMark, BrandName } from "@/components/shell/brand-mark";

const linkClass =
  "rounded-full py-1 text-muted-foreground transition-colors hover:text-foreground";

export function AppFooter({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  return (
    <footer className="mt-16 px-3 pb-3 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-border bg-card px-6 py-8 shadow-sm sm:px-10">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <BrandName />
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Friendly, step-by-step fixes for everyday tech problems — and a
              real person when you need one.
            </p>
          </div>

          <nav aria-label="Get help" className="text-sm">
            <h2 className="font-heading text-base font-semibold">Get help</h2>
            <ul className="mt-3 grid gap-1.5">
              <li>
                <Link href="/browse" className={linkClass}>
                  Browse solutions
                </Link>
              </li>
              <li>
                <Link href="/status" className={linkClass}>
                  System status
                </Link>
              </li>
              {signedIn && (
                <li>
                  <Link href="/assistant" className={linkClass}>
                    New ticket
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-label="Account" className="text-sm">
            <h2 className="font-heading text-base font-semibold">Account</h2>
            <ul className="mt-3 grid gap-1.5">
              {signedIn ? (
                <li>
                  <Link href="/tickets" className={linkClass}>
                    My tickets
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href="/login" className={linkClass}>
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link href="/signup" className={linkClass}>
                      Sign up
                    </Link>
                  </li>
                </>
              )}
              {staff && (
                <li>
                  <Link href="/admin/login" className={linkClass}>
                    Staff log in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 HelpDesk First</span>
          <span className="max-w-xl sm:text-right">
            Level-1 guidance only — for managed devices or anything outside your
            authority, contact your IT team.
          </span>
        </div>
      </div>
    </footer>
  );
}
