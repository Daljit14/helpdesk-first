"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bookmark,
  Bot,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  Ticket,
  UserRound,
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
  { href: "/", label: "Start", icon: Home },
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
  layout = "row",
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
                    "flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold transition-colors",
                    layout === "row" ? "px-3 xl:px-4" : "px-4 py-3 text-base",
                    active
                      ? "bg-secondary text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4", layout === "column" && "h-5 w-5")}
                    aria-hidden
                  />
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
        <span className="hidden sm:inline">
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
  const showBreadcrumbs = pathname !== "/" && breadcrumbs.length > 1;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 rounded-full border border-border bg-card/90 pl-3 pr-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
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

          <Link
            href="/"
            aria-label="HelpDesk First"
            className="flex shrink-0 items-center gap-2.5 rounded-full pr-2"
          >
            <BrandMark />
            <BrandName className="hidden sm:inline lg:hidden xl:inline" />
          </Link>

          <div className="mx-auto hidden lg:block">
            <Navigation pathname={pathname} aiEnabled={aiEnabled} />
          </div>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <ThemeToggle />
            {email ? (
              <>
                <span
                  className="hidden max-w-48 items-center gap-2 truncate rounded-full bg-muted px-3 py-2 text-sm font-medium 2xl:inline-flex"
                  title={email}
                >
                  <UserRound className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{email}</span>
                </span>
                <form action={logoutAction} className="hidden sm:block">
                  <Button type="submit" variant="outline" size="sm">
                    <LogOut aria-hidden />
                    Log out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "hidden sm:inline-flex"
                  )}
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className={buttonVariants({ variant: "default", size: "sm" })}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {showBreadcrumbs && (
        <div className="mx-auto w-full max-w-6xl px-5 pt-5 sm:px-9">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 focus:outline-none"
      >
        {children}
      </main>
      <AppFooter signedIn={Boolean(email)} staff={staff} />

      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Navigation"
        triggerRef={drawerTriggerRef}
      >
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <BrandMark />
          <BrandName />
        </div>
        <Navigation
          pathname={pathname}
          aiEnabled={aiEnabled}
          onNavigate={() => setDrawerOpen(false)}
          label="Mobile"
          layout="column"
        />
        <div className="mt-6 grid gap-1.5 border-t border-border pt-5">
          <Link
            href="/status"
            onClick={() => setDrawerOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Activity className="h-4 w-4" aria-hidden />
            System status
            <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </Link>
          {staff && (
            <Link
              href="/admin/login"
              onClick={() => setDrawerOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Staff console
              <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
            </Link>
          )}
          <div className="flex items-center justify-between rounded-full px-4 py-1 text-sm text-muted-foreground">
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
