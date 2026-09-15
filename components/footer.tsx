"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Headset } from "lucide-react";
import { getIssueBySlug } from "@/lib/search";

const currentYear = new Date().getFullYear();
const linkClassName =
  "text-sm text-muted-foreground transition hover:text-foreground";
const headingClassName =
  "text-xs font-semibold uppercase tracking-wide text-foreground/80";

const popularFixes = [
  "slow-computer",
  "no-internet",
  "wifi-disconnecting",
  "printer-offline",
  "forgot-password",
]
  .map((slug) => getIssueBySlug(slug))
  .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));

export function Footer({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="px-6 py-8">
      <div className="glass mx-auto max-w-6xl rounded-xl p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Headset className="h-5 w-5" aria-hidden />
              HelpDesk First
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Fix common IT problems in minutes — safe, step-by-step Level-1
              help.
            </p>
            <Link
              className={`${linkClassName} mt-4 inline-flex items-center gap-2`}
              href="/status"
            >
              <Activity className="h-4 w-4" aria-hidden />
              System status
            </Link>
          </div>

          <nav aria-label="Footer" className="grid content-start gap-2">
            <p className={headingClassName}>Get help</p>
            <Link className={linkClassName} href="/browse">
              Browse solutions
            </Link>
            <Link className={linkClassName} href="/assistant">
              Ask the assistant
            </Link>
            <Link className={linkClassName} href="/tickets">
              My tickets
            </Link>
            <Link className={linkClassName} href="/bookmarks">
              Bookmarks
            </Link>
          </nav>

          <nav aria-label="Popular fixes" className="grid content-start gap-2">
            <p className={headingClassName}>Popular fixes</p>
            {popularFixes.map((issue) => (
              <Link
                key={issue.id}
                className={linkClassName}
                href={`/issues/${issue.id}`}
              >
                {issue.title}
              </Link>
            ))}
          </nav>

          <nav aria-label="Account" className="grid content-start gap-2">
            <p className={headingClassName}>Account</p>
            {signedIn ? (
              <>
                <Link className={linkClassName} href="/assistant">
                  New ticket
                </Link>
                <Link className={linkClassName} href="/tickets#notifications">
                  Notification settings
                </Link>
              </>
            ) : (
              <>
                <Link className={linkClassName} href="/login">
                  Sign in
                </Link>
                <Link className={linkClassName} href="/signup">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span>© {currentYear} HelpDesk First</span>
          <span>
            Level-1 guidance only — for managed devices or anything outside your
            authority, contact your IT team.
          </span>
          {staff && (
            <Link
              className="text-xs text-muted-foreground transition hover:text-foreground"
              href="/admin/login"
            >
              Staff sign in
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
