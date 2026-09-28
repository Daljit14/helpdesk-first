"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookMarked,
  Bot,
  ChevronRight,
  Headset,
  LayoutDashboard,
  Menu,
  Moon,
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
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/browse", label: "Browse solutions", icon: BookMarked },
  { href: "/assistant", label: "Support Assistant", icon: Bot, ai: true },
  { href: "/tickets", label: "My tickets", icon: Ticket },
  { href: "/bookmarks", label: "Bookmarks", icon: BookMarked },
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
      <ul className="grid gap-1">
        {navItems
          .filter((item) => !item.ai || aiEnabled)
          .map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-nav-muted hover:bg-nav-foreground/10 hover:text-nav-foreground",
                  isActive(pathname, href) &&
                    "bg-nav-foreground/10 text-nav-foreground"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}

export function AppShell({
  children,
  email,
  staff = false,
  aiEnabled = false,
}: {
  children: ReactNode;
  email?: string | null;
  staff?: boolean;
  aiEnabled?: boolean;
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
  return (
    <div className="min-h-full bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-nav px-4 py-5 text-nav-foreground lg:flex">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 text-lg font-semibold"
        >
          <Headset className="h-5 w-5 text-primary" aria-hidden />
          HelpDesk First
        </Link>
        <div className="mt-8">
          <Navigation pathname={pathname} aiEnabled={aiEnabled} />
        </div>
        <div className="mt-auto grid gap-3 border-t border-nav-muted/30 pt-4">
          <Link
            href="/status"
            className="flex items-center gap-3 px-3 py-2 text-sm text-nav-muted hover:text-nav-foreground"
          >
            <Activity className="h-4 w-4" aria-hidden />
            System status
          </Link>
          {email ? (
            <div className="flex items-center gap-3 px-3 text-sm text-nav-muted">
              <span className="min-w-0 truncate" title={email}>
                {email}
              </span>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-3 px-3 py-2 text-sm text-nav-muted hover:text-nav-foreground"
            >
              Log in
            </Link>
          )}
          {email ? (
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start px-3 text-nav-muted hover:bg-nav-foreground/10 hover:text-nav-foreground"
              >
                Log out
              </Button>
            </form>
          ) : (
            <Link
              href="/signup"
              className="flex items-center gap-3 px-3 py-2 text-sm text-nav-muted hover:text-nav-foreground"
            >
              Sign up
            </Link>
          )}
          {staff && (
            <Link
              href="/admin/login"
              className="flex items-center gap-3 px-3 py-2 text-sm text-nav-muted hover:text-nav-foreground"
            >
              Staff console
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              ref={drawerTriggerRef}
              type="button"
              variant="ghost"
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
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
            {email ? (
              <form action={logoutAction} className="hidden sm:block">
                <Button type="submit" variant="outline" size="sm">
                  Log out
                </Button>
              </form>
            ) : (
              <Link
                href="/login"
                className="hidden rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary sm:block"
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
        <div className="mb-4 flex items-center gap-2 px-3 text-lg font-semibold">
          <Headset className="h-5 w-5 text-primary" aria-hidden />
          HelpDesk First
        </div>
        <Navigation
          pathname={pathname}
          aiEnabled={aiEnabled}
          onNavigate={() => setDrawerOpen(false)}
          label="Mobile"
        />
        <div className="mt-6 border-t border-nav-muted/30 pt-4">
          <Link
            href="/status"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-nav-muted hover:bg-nav-foreground/10 hover:text-nav-foreground"
          >
            <Activity className="h-4 w-4" aria-hidden />
            System status
            <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </Link>
          {email ? (
            <>
              <p
                className="truncate px-3 py-3 text-sm text-nav-muted"
                title={email}
              >
                {email}
              </p>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-3 text-left text-sm text-nav-muted hover:bg-nav-foreground/10 hover:text-nav-foreground"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setDrawerOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm text-nav-muted hover:bg-nav-foreground/10 hover:text-nav-foreground"
            >
              Log in
            </Link>
          )}
        </div>
      </Sheet>
    </div>
  );
}
