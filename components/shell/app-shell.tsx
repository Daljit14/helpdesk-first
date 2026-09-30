"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bookmark,
  Bot,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Mail,
  Menu,
  Moon,
  Printer,
  Search,
  Sun,
  Ticket,
  Volume2,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { breadcrumbsForPath } from "@/components/shell/breadcrumbs-for-path";
import { AppFooter } from "@/components/shell/app-footer";
import { BrandMark } from "@/components/shell/brand-mark";
import { AnimatedAvatar } from "@/components/avatar/animated-avatar";
import { AccountChip } from "@/components/shell/account-chip";
import { TypewriterText } from "@/components/assistant/typewriter-text";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ai?: boolean;
  live?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/browse", label: "Browse solutions", icon: Search },
  { href: "/assistant", label: "Support Assistant", icon: Bot, ai: true },
  { href: "/tickets", label: "My tickets", icon: Ticket },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/tools", label: "Toolkit", icon: Wrench },
  { href: "/status", label: "System status", icon: Activity, live: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({
  pathname,
  aiEnabled,
  onNavigate,
  label = "Primary navigation",
}: {
  pathname: string;
  aiEnabled: boolean;
  onNavigate?: () => void;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="min-w-0 shrink-0">
      <ul className="grid min-w-0 gap-1.5 [@media(max-height:780px)]:gap-1">
        {navItems
          .filter((item) => !item.ai || aiEnabled)
          .map(({ href, label, icon: Icon, live }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex min-h-12 min-w-0 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold [@media(max-height:780px)]:min-h-10",
                    active
                      ? "hf-pill-in bg-secondary text-secondary-foreground"
                      : "hf-navlink text-nav-muted hover:bg-muted hover:text-foreground"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-4 top-3 bottom-3 w-1 rounded-r bg-primary"
                    />
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{label}</span>
                  {live && (
                    <span
                      aria-hidden
                      className="relative ml-auto flex h-2 w-2 shrink-0"
                    >
                      <span className="hf-ping absolute inset-0 rounded-full bg-status-success" />
                      <span className="relative h-2 w-2 rounded-full bg-status-success" />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

const HELPER_LINES = [
  "Hi! Need a hand?",
  "Wi-Fi acting up?",
  "Printer offline again?",
  "Forgot a password?",
  "I can find the right fix.",
];

function RotatingTip() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % HELPER_LINES.length),
      3200
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="min-w-0 flex-1 truncate">
      <TypewriterText key={index} text={HELPER_LINES[index]} speed={35} />
    </span>
  );
}

function AssistantHelper({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="hf-side-chat relative min-w-0 shrink-0 overflow-hidden rounded-[22px] border border-border bg-card p-3.5 text-foreground shadow-sm [@media(max-height:780px)]:hidden">
        <span
          aria-hidden
          className="hf-side-orb pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full"
        />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <AnimatedAvatar
              id="bot"
              size={44}
              className="ring-2 ring-card shadow-sm"
            />
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-status-success"
            />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold leading-tight">
              Stuck on something?
            </p>
            <p className="truncate text-xs font-medium text-muted-foreground">
              Chat with the assistant — it can hand you to a person.
            </p>
          </div>
        </div>
        <p className="relative mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-muted px-2.5 py-2 text-xs font-bold">
          <Lightbulb
            className="h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden
          />
          <RotatingTip />
        </p>
        <Link
          href="/assistant"
          onClick={onNavigate}
          className="group relative mt-3 flex min-h-11 w-full shrink-0 items-center gap-2 rounded-xl bg-[linear-gradient(120deg,#4b2fb8,#7c5cff_45%,#d946ef)] px-4 text-[13px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          Start a chat
          <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </Link>
      </div>
      <Link
        href="/assistant"
        onClick={onNavigate}
        className="hidden min-h-12 min-w-0 shrink-0 items-center gap-3 rounded-2xl bg-muted px-3 text-sm font-bold [@media(max-height:780px)]:flex"
      >
        <AnimatedAvatar id="bot" size={32} className="bg-card" />
        Start a chat
        <ArrowRight className="ml-auto h-4 w-4" aria-hidden />
      </Link>
    </>
  );
}

/** Popular guides, shown three at a time and rotated every few seconds. */
const QUICK_FIXES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "wifi-disconnecting", label: "Wi-Fi keeps dropping", icon: Wifi },
  { id: "printer-offline", label: "Printer is offline", icon: Printer },
  { id: "forgot-password", label: "Forgot my password", icon: KeyRound },
  { id: "no-sound", label: "No sound", icon: Volume2 },
  { id: "email-not-syncing", label: "Email not syncing", icon: Mail },
  { id: "slow-computer", label: "Computer is slow", icon: Zap },
];

function QuickFixes({ onNavigate }: { onNavigate?: () => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(QUICK_FIXES.length / 3);
  useEffect(() => {
    const id = window.setInterval(
      () => setPage((value) => (value + 1) % pages),
      9000
    );
    return () => window.clearInterval(id);
  }, [pages]);
  const titleId = useId();
  const visible = QUICK_FIXES.slice(page * 3, page * 3 + 3);
  return (
    <section
      aria-labelledby={titleId}
      className="hf-side-quick min-w-0 shrink-0 rounded-[22px] border border-border bg-card/70 p-3 [@media(max-height:780px)]:hidden"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2
          id={titleId}
          className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground"
        >
          Quick fixes
        </h2>
        <span aria-hidden className="flex gap-1">
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === page ? "w-4 bg-primary" : "w-1.5 bg-border"
              )}
            />
          ))}
        </span>
      </div>
      <ul key={page} className="hf-swap mt-2 grid min-w-0 gap-1">
        {visible.map(({ id, label, icon: Icon }) => (
          <li key={id} className="min-w-0">
            <Link
              href={`/issues/${id}/guide`}
              onClick={onNavigate}
              className="group flex min-h-10 min-w-0 items-center gap-2.5 rounded-xl px-2 text-[13px] font-semibold text-nav-muted hover:bg-muted hover:text-foreground"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SidebarFooter({
  email,
  staff,
  avatar,
  displayName,
  onNavigate,
}: {
  email?: string | null;
  staff: boolean;
  avatar?: string | null;
  displayName?: string | null;
  onNavigate?: () => void;
}) {
  const linkClass =
    "hf-navlink flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-nav-muted hover:bg-muted hover:text-foreground";
  return (
    <div className="grid min-w-0 gap-1.5 border-t border-border pt-4 [@media(max-height:780px)]:pt-3">
      {email ? (
        <>
          <AccountChip email={email} avatar={avatar} name={displayName} />
          <form action={logoutAction} className="px-2">
            <Button
              type="submit"
              variant="outline"
              className="w-full justify-start"
            >
              <LogOut aria-hidden />
              Log out
            </Button>
          </form>
        </>
      ) : (
        <div className="grid gap-2 px-2 pt-1">
          <Link
            href="/login"
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-[var(--hover)]"
          >
            Sign up
          </Link>
        </div>
      )}
      {staff && (
        <Link href="/admin/login" onClick={onNavigate} className={linkClass}>
          Staff console
          <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="hf-logo flex items-center gap-2.5 px-2">
      <BrandMark />
      <span className="text-xl font-extrabold tracking-tight">
        HelpDesk First
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  email,
  staff = false,
  aiEnabled = false,
  avatar,
  displayName,
}: {
  children: ReactNode;
  email?: string | null;
  staff?: boolean;
  aiEnabled?: boolean;
  avatar?: string | null;
  /** Optional full name (user_metadata.full_name) shown on the account chip. */
  displayName?: string | null;
}) {
  const pathname = usePathname() ?? "/";
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      setDrawerOpen(false);
      previousPathname.current = pathname;
    }
  }, [pathname]);

  if (pathname.startsWith("/admin")) return <>{children}</>;

  const breadcrumbs = breadcrumbsForPath(pathname);
  const themeLabel = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-full bg-background text-foreground lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hf-side sticky top-0 hidden h-screen min-w-0 flex-col gap-5 overflow-y-auto overflow-x-hidden border-r border-border bg-nav px-4 py-6 text-nav-foreground [@media(max-height:780px)]:gap-3 [@media(max-height:780px)]:py-4 lg:flex">
        <Brand />
        <Navigation pathname={pathname} aiEnabled={aiEnabled} />
        {aiEnabled && <AssistantHelper />}
        <QuickFixes />
        <div className="mt-auto min-w-0 shrink-0">
          <SidebarFooter
            email={email}
            staff={staff}
            avatar={avatar}
            displayName={displayName}
          />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              ref={drawerTriggerRef}
              type="button"
              variant="outline"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <div className="min-w-0">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
            {!email && (
              <Link
                href="/login"
                className="hidden min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-[var(--hover)] sm:inline-flex lg:hidden"
              >
                Log in
              </Link>
            )}
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 focus:outline-none"
        >
          {children}
        </main>
        <AppFooter signedIn={Boolean(email)} staff={staff} />
      </div>

      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Navigation"
        triggerRef={drawerTriggerRef}
      >
        <div className="hf-side flex min-h-full w-full min-w-0 max-w-full flex-col gap-5">
          <Brand />
          <Navigation
            pathname={pathname}
            aiEnabled={aiEnabled}
            onNavigate={closeDrawer}
            label="Mobile"
          />
          {aiEnabled && <AssistantHelper onNavigate={closeDrawer} />}
          <QuickFixes onNavigate={closeDrawer} />
          <div className="mt-auto min-w-0 shrink-0">
            <SidebarFooter
              email={email}
              staff={staff}
              avatar={avatar}
              displayName={displayName}
              onNavigate={closeDrawer}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
