"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Bot,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  Ticket,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { breadcrumbsForPath } from "@/components/shell/breadcrumbs-for-path";
import { AppFooter } from "@/components/shell/app-footer";
import { AvatarPicker } from "@/components/shell/avatar-picker";
import { AssistantBot, BrandMark } from "@/components/shell/brand-mark";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/browse", label: "Browse solutions", icon: Search },
  { href: "/assistant", label: "Support Assistant", icon: Bot, ai: true },
  { href: "/tickets", label: "My tickets", icon: Ticket },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
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
    <nav aria-label={label}>
      <ul className="grid gap-1.5">
        {navItems
          .filter((item) => !item.ai || aiEnabled)
          .map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex min-h-12 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold",
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
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

function AssistantHelper({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="hf-hue relative overflow-hidden rounded-[20px] bg-[linear-gradient(120deg,var(--muted),#fdf2f8,#eef6ff,var(--muted))] p-4 text-foreground dark:bg-[linear-gradient(120deg,#2c2350,#3a1f3d,#1f2a4d,#2c2350)]">
      <div className="flex items-start gap-2.5">
        <AssistantBot className="pointer-events-none" />
        <span className="hf-bubble pointer-events-none mt-1 rounded-xl rounded-bl-sm bg-card px-2.5 py-1.5 text-xs font-bold shadow-sm">
          Hi! Need a hand?
        </span>
      </div>
      <p className="mt-2.5 text-[15px] font-extrabold">Stuck on something?</p>
      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
        Chat with the assistant — it can hand you to a person.
      </p>
      <Link
        href="/assistant"
        onClick={onNavigate}
        className="hf-lift relative z-10 mt-3 inline-flex min-h-10 items-center rounded-xl bg-foreground px-3.5 text-[13px] font-bold text-background"
      >
        Start a chat
      </Link>
    </div>
  );
}

function SidebarFooter({
  email,
  staff,
  avatar,
  onNavigate,
}: {
  email?: string | null;
  staff: boolean;
  avatar?: string | null;
  onNavigate?: () => void;
}) {
  const linkClass =
    "hf-navlink flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-nav-muted hover:bg-muted hover:text-foreground";
  return (
    <div className="grid gap-1.5 border-t border-border pt-4">
      <Link href="/status" onClick={onNavigate} className={linkClass}>
        <span className="relative flex h-[18px] w-[18px] items-center justify-center">
          <span className="hf-ping absolute h-2 w-2 rounded-full bg-status-success" />
          <span className="h-2 w-2 rounded-full bg-status-success" />
        </span>
        System status
      </Link>
      {email ? (
        <>
          <AvatarPicker email={email} avatar={avatar} />
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
}: {
  children: ReactNode;
  email?: string | null;
  staff?: boolean;
  aiEnabled?: boolean;
  avatar?: string | null;
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
      <aside className="sticky top-0 hidden h-screen flex-col gap-7 overflow-y-auto border-r border-border bg-nav px-4 py-6 text-nav-foreground lg:flex">
        <Brand />
        <Navigation pathname={pathname} aiEnabled={aiEnabled} />
        {aiEnabled && <AssistantHelper />}
        <div className="mt-auto">
          <SidebarFooter email={email} staff={staff} avatar={avatar} />
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
        <div className="flex min-h-full flex-col gap-6">
          <Brand />
          <Navigation
            pathname={pathname}
            aiEnabled={aiEnabled}
            onNavigate={closeDrawer}
            label="Mobile"
          />
          {aiEnabled && <AssistantHelper onNavigate={closeDrawer} />}
          <div className="mt-auto">
            <SidebarFooter
              email={email}
              staff={staff}
              avatar={avatar}
              onNavigate={closeDrawer}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
