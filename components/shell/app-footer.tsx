"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUp, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";

const linkClass =
  "inline-flex min-h-9 items-center rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-primary";

const POPULAR_FIXES = [
  { href: "/issues/slow-computer", label: "Slow computer" },
  { href: "/issues/no-internet", label: "No internet connection" },
  {
    href: "/issues/wifi-disconnecting",
    label: "Wi-Fi keeps disconnecting",
  },
  { href: "/issues/printer-offline", label: "Printer showing offline" },
  { href: "/issues/forgot-password", label: "Forgot password" },
];

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = `footer-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-sm font-extrabold text-foreground">
        {title}
      </h2>
      <ul className="mt-3 grid gap-0.5">{children}</ul>
    </nav>
  );
}

export function AppFooter({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  function backToTop() {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }

  return (
    <footer className="px-4 pb-6 pt-10 sm:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="grid gap-10 p-6 sm:p-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              className="hf-logo flex items-center gap-2.5 self-start"
            >
              <BrandMark />
              <span className="text-lg font-extrabold tracking-tight">
                HelpDesk First
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Safe, step-by-step fixes for everyday IT problems — and a real
              person when you need one.
            </p>
            <Link
              href="/status"
              className="hf-lift inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground"
            >
              <span className="relative flex h-2 w-2">
                <span className="hf-ping absolute inset-0 rounded-full bg-status-success" />
                <span className="relative h-2 w-2 rounded-full bg-status-success" />
              </span>
              System status
            </Link>
          </div>

          <FooterColumn title="Get help">
            <li>
              <Link href="/browse" className={linkClass}>
                Browse solutions
              </Link>
            </li>
            <li>
              <Link href="/assistant" className={linkClass}>
                Ask the assistant
              </Link>
            </li>
            <li>
              <Link href="/browse?category=security" className={linkClass}>
                Security & scams help
              </Link>
            </li>
          </FooterColumn>

          <FooterColumn title="Popular fixes">
            {POPULAR_FIXES.map((fix) => (
              <li key={fix.href}>
                <Link href={fix.href} className={linkClass}>
                  {fix.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Your account">
            {signedIn ? (
              <>
                <li>
                  <Link href="/assistant" className={linkClass}>
                    New ticket
                  </Link>
                </li>
                <li>
                  <Link href="/tickets" className={linkClass}>
                    My tickets
                  </Link>
                </li>
                <li>
                  <Link href="/bookmarks" className={linkClass}>
                    Bookmarks
                  </Link>
                </li>
              </>
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
                <li>
                  <Link href="/forgot-password" className={linkClass}>
                    Forgot password?
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
          </FooterColumn>
        </div>

        <div className="flex items-start gap-3 border-t border-border bg-muted/60 px-6 py-4 text-[13px] leading-relaxed text-muted-foreground sm:px-8">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden
          />
          <p>
            Level-1 guidance only. For work-managed devices, or anything you
            aren&apos;t authorized to change, contact your IT team.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-6 py-4 text-xs font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 HelpDesk First</span>
          <button
            type="button"
            onClick={backToTop}
            className="group inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg px-2 font-bold text-foreground hover:bg-muted sm:self-auto"
          >
            Back to top
            <ArrowUp
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5"
              aria-hidden
            />
          </button>
        </div>
      </div>
    </footer>
  );
}
