"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
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
import { BrandMark, BrandName } from "@/components/shell/brand-mark";
import { buttonVariants } from "@/lib/button-variants";
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
  layout = "column",
}: {
  pathname: string;
  aiEnabled: boolean;
  onNavigate?: () => void;
  label?: string;
  layout?: "row" | "column";
}) {
  return (
    <nav aria-label={label}>
      <ul
        className={cn(
          layout === "row" ? "flex items-center gap-1" : "grid gap-1.5"
        )}
      >
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
                    "flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      className={cn(compact ? "" : "inline-flex")}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {!compact && (
        <span className="hidden sm:inline lg:hidden xl:inline">
          {theme === "dark" ? "Light" : "Dark"}
        </span>
      )}
    </Button>
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
      <aside className="sticky top-0 hidden h-screen w-[240px] flex-col overflow-y-auto border-r border-border bg-nav px-4 py-5 text-nav-foreground lg:flex">
        <Link
          href="/"
          aria-label="HelpDesk First"
          className="flex items-center gap-2 px-3"
        >
          <BrandMark className="h-8 w-8 rounded-xl" />
          <BrandName className="text-nav-foreground" />
        </Link>
        <div className="mt-8">
          <Navigation pathname={pathname} aiEnabled={aiEnabled} />
        </div>
        <div className="mt-auto grid gap-1.5 border-t border-border pt-4">
          <Link
            href="/status"
            className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
          >
            <Activity className="h-4 w-4" aria-hidden />
            System status
          </Link>
          {email ? (
            <p
              className="truncate px-4 py-3 text-sm text-nav-muted"
              title={email}
            >
              {email}
            </p>
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
            >
              Log in
            </Link>
          )}
          {email ? (
            <form action={logoutAction} className="px-2">
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start rounded-xl px-2 text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
              >
                <LogOut aria-hidden />
                Log out
              </Button>
            </form>
          ) : (
            <Link
              href="/signup"
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
            >
              Sign up
            </Link>
          )}
          {staff && (
            <Link
              href="/admin/login"
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground"
            >
              Staff console
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-8">
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
            <ThemeToggle />
            {email ? (
              <form action={logoutAction} className="hidden sm:block">
                <Button type="submit" variant="outline" size="sm">
                  <LogOut aria-hidden />
                  Log out
                </Button>
              </form>
            ) : (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex"
                )}
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
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <BrandMark className="h-8 w-8 rounded-xl" />
          <BrandName />
        </div>
        <Navigation
          pathname={pathname}
          aiEnabled={aiEnabled}
          onNavigate={() => setDrawerOpen(false)}
          label="Mobile"
        />
        <div className="mt-6 grid gap-1.5 border-t border-border pt-5">
          <Link
            href="/status"
            onClick={() => setDrawerOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Activity className="h-4 w-4" aria-hidden />
            System status
            <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </Link>
          {staff && (
            <Link
              href="/admin/login"
              onClick={() => setDrawerOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Staff console
              <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
            </Link>
          )}
          <div className="flex items-center justify-between rounded-xl px-4 py-1 text-sm text-muted-foreground">
            <span>Appearance</span>
            <ThemeToggle compact />
          </div>
          {email ? (
            <>
              <p
                className="truncate px-4 py-3 text-sm text-muted-foreground"
                title={email}
              >
                {email}
              </p>
              <form action={logoutAction} className="px-2">
                <Button type="submit" variant="outline" className="w-full">
                  <LogOut aria-hidden />
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <div className="grid gap-2 px-2 pt-2">
              <Link
                href="/login"
                onClick={() => setDrawerOpen(false)}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setDrawerOpen(false)}
                className={cn(buttonVariants({ variant: "default" }), "w-full")}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
