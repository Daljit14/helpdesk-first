"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  Bot,
  BookOpen,
  Gauge,
  Globe,
  Headset,
  KeyRound,
  Lock,
  MessagesSquare,
  Printer,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  UserRound,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AnimatedAvatar } from "@/components/avatar/animated-avatar";
import {
  STATUS_DOT,
  STATUS_TEXT,
  useLiveStatus,
  type FooterStatus,
} from "@/components/shell/footer-status";
import { cn } from "@/lib/utils";

type FooterLink = { href: string; label: string; icon: LucideIcon };

const POPULAR_FIXES: FooterLink[] = [
  { href: "/issues/slow-computer", label: "Slow computer", icon: Gauge },
  { href: "/issues/no-internet", label: "No internet connection", icon: Globe },
  {
    href: "/issues/wifi-disconnecting",
    label: "Wi-Fi keeps disconnecting",
    icon: Wifi,
  },
  {
    href: "/issues/printer-offline",
    label: "Printer showing offline",
    icon: Printer,
  },
  { href: "/issues/forgot-password", label: "Forgot password", icon: KeyRound },
];

const GET_HELP: FooterLink[] = [
  { href: "/browse", label: "Browse solutions", icon: BookOpen },
  { href: "/assistant", label: "Ask the assistant", icon: Bot },
  { href: "/tools", label: "Toolkit", icon: Wrench },
  {
    href: "/browse?category=security",
    label: "Security & scams help",
    icon: ShieldCheck,
  },
  { href: "/status", label: "System status", icon: Activity },
];

const SIGNED_IN_LINKS: FooterLink[] = [
  { href: "/assistant", label: "New ticket", icon: MessagesSquare },
  { href: "/tickets", label: "My tickets", icon: Ticket },
  { href: "/bookmarks", label: "Bookmarks", icon: Star },
];

const SIGNED_OUT_LINKS: FooterLink[] = [
  { href: "/login", label: "Log in", icon: UserRound },
  { href: "/signup", label: "Sign up", icon: Sparkles },
  { href: "/forgot-password", label: "Forgot password?", icon: KeyRound },
];

function FooterColumn({
  title,
  links,
  index,
}: {
  title: string;
  links: FooterLink[];
  index: number;
}) {
  const id = `footer-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <nav
      aria-labelledby={id}
      className="hf-foot-reveal"
      style={{ "--hf-foot-i": index + 1 } as CSSProperties}
    >
      <h2
        id={id}
        className="text-xs font-extrabold uppercase tracking-[0.14em] text-foreground"
      >
        {title}
      </h2>
      <ul className="mt-3 grid gap-0.5">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={`${href}-${label}`}>
            <Link href={href} className="hf-foot-link">
              <Icon
                className="hf-foot-link-icon h-4 w-4 shrink-0"
                aria-hidden
              />
              <span className="hf-foot-link-text">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function LogoMark({ status }: { status: FooterStatus }) {
  return (
    <span
      aria-hidden
      className="hf-logomark relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-5 w-5"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" />
      </svg>
      {/* Live status indicator: mirrors the status pill colour. */}
      <span
        className={cn(
          "absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card transition-colors",
          STATUS_DOT[status]
        )}
      />
    </span>
  );
}

export function AppFooter({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  const status = useLiveStatus();
  const rootRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setRevealed(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function backToTop() {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }

  const accountLinks = signedIn ? SIGNED_IN_LINKS : SIGNED_OUT_LINKS;
  const pulsing = status === "ok" || status === "degraded" || status === "down";

  return (
    <footer
      ref={rootRef}
      data-revealed={revealed ? "true" : "false"}
      className="hf-foot px-4 pb-6 pt-10 sm:px-8"
    >
      <div className="hf-foot-card mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="hf-foot-topline" aria-hidden />

        <section
          aria-labelledby="footer-still-stuck"
          className="hf-foot-cta hf-foot-reveal relative overflow-hidden px-6 py-8 text-white sm:px-8"
          style={{ "--hf-foot-i": 0 } as CSSProperties}
        >
          <span aria-hidden className="hf-foot-orb hf-foot-orb-a" />
          <span aria-hidden className="hf-foot-orb hf-foot-orb-b" />
          <Sparkles
            aria-hidden
            className="hf-foot-spark left-[46%] top-5 h-4 w-4"
          />
          <Sparkles
            aria-hidden
            className="hf-foot-spark hf-foot-spark-b right-[30%] top-10 h-3 w-3"
          />
          <Sparkles
            aria-hidden
            className="hf-foot-spark hf-foot-spark-c bottom-6 left-[36%] h-3.5 w-3.5"
          />
          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <span className="hf-foot-bot hidden shrink-0 rounded-full bg-white/15 p-2 ring-1 ring-white/30 sm:block">
                <AnimatedAvatar id="bot" size={72} />
              </span>
              <div>
                <h2
                  id="footer-still-stuck"
                  className="text-2xl font-extrabold tracking-tight sm:text-3xl"
                >
                  Still stuck?
                </h2>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-white/90 sm:text-base">
                  Describe what&apos;s going wrong and get a safe next step in
                  seconds — or hand it to a real person.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/assistant" className="hf-foot-cta-primary">
                <Bot className="h-4 w-4" aria-hidden />
                Chat with the assistant
                <ArrowRight className="hf-foot-cta-arrow h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/assistant?intent=human"
                className="hf-foot-cta-secondary"
              >
                <Headset className="h-4 w-4" aria-hidden />
                Talk to a person
              </Link>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 gap-y-10 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
          <div
            className="hf-foot-reveal flex flex-col gap-4 sm:col-span-2 lg:col-span-1"
            style={{ "--hf-foot-i": 1 } as CSSProperties}
          >
            <Link
              href="/"
              className="hf-logo flex items-center gap-2.5 self-start"
            >
              <LogoMark status={status} />
              <span className="text-lg font-extrabold tracking-tight">
                HelpDesk First
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-foreground/75">
              Safe, step-by-step fixes for everyday IT problems, and a real
              person when you need one.
            </p>
            <Link
              href="/status"
              className="hf-lift inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground"
            >
              <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
                {pulsing && (
                  <span
                    className={cn(
                      "hf-ping absolute inset-0 rounded-full",
                      STATUS_DOT[status]
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative h-2.5 w-2.5 rounded-full",
                    STATUS_DOT[status]
                  )}
                />
              </span>
              <span aria-live="polite">{STATUS_TEXT[status]}</span>
            </Link>
          </div>

          <FooterColumn title="Get help" links={GET_HELP} index={2} />
          <FooterColumn title="Popular fixes" links={POPULAR_FIXES} index={3} />
          <FooterColumn title="Your account" links={accountLinks} index={4} />
        </div>

        <div
          className="hf-foot-reveal flex items-start gap-3 border-t border-border bg-primary/[0.06] px-6 py-4 text-[13px] leading-relaxed text-foreground/80 sm:px-8"
          style={{ "--hf-foot-i": 5 } as CSSProperties}
        >
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden
          />
          <p>
            Level-1 guidance only. For work-managed devices, or anything you
            aren&apos;t authorized to change, contact your IT team.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-6 py-4 text-xs font-semibold text-foreground/70 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© 2026 HelpDesk First</span>
            {staff && (
              <Link href="/admin/login" className="hf-foot-staff">
                <Lock className="h-3 w-3" aria-hidden />
                Staff log in
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={backToTop}
            className="hf-foot-top group"
          >
            Back to top
            <ArrowUp className="hf-foot-top-arrow h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );
}
