"use client";

import {
  Activity,
  Bell,
  BookOpen,
  BrainCircuit,
  Building2,
  Database,
  ChevronLeft,
  ChevronRight,
  Menu,
  Paperclip,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  UsersRound,
  X,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/shell/brand-mark";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminLogout } from "@/app/actions/admin-auth";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import type { Department } from "./departments";

const icons = {
  activity: Activity,
  ticket: Ticket,
  brain: BrainCircuit,
  users: UsersRound,
  book: BookOpen,
  building: Building2,
  paperclip: Paperclip,
  bell: Bell,
  chart: BarChart3,
  database: Database,
  shield: ShieldCheck,
  plug: Plug,
  settings: Settings,
} as const;

function DepartmentIcon({ name }: { name: string }) {
  const Icon = icons[name as keyof typeof icons] ?? Activity;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}

export function departmentForPath(
  pathname: string,
  searchParams: { get(name: string): string | null },
  departments: Department[],
  hash = ""
) {
  if (pathname === "/admin/operations" && hash === "#tickets") {
    return (
      departments.find((department) => department.id === "ticket-queue") ??
      departments[0]
    );
  }
  if (pathname.startsWith("/admin/tickets")) {
    return (
      departments.find((department) => department.id === "ticket-queue") ??
      departments[0]
    );
  }
  const queue = searchParams.get("queue");
  if (pathname === "/admin/operations" && queue === "ai_working") {
    return (
      departments.find((department) => department.id === "ai-investigations") ??
      departments[0]
    );
  }
  if (pathname === "/admin/operations" && queue === "needs_human") {
    return (
      departments.find(
        (department) => department.id === "capability-matching"
      ) ?? departments[0]
    );
  }
  return (
    departments.find((department) => {
      const path = department.href.split("?")[0].split("#")[0];
      return (
        pathname === path ||
        (path !== "/admin/operations" && pathname.startsWith(path))
      );
    }) ?? departments[0]
  );
}

export function AdminShell({
  children,
  departments,
  organizationName,
  roleLabel,
  isPlatformAdmin,
  pendingNotifications,
}: {
  children: React.ReactNode;
  departments: Department[];
  organizationName: string;
  roleLabel: string;
  isPlatformAdmin: boolean;
  pendingNotifications: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [hash, setHash] = useState("");
  const current = departmentForPath(pathname, searchParams, departments, hash);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return departments;
    return departments.filter((department) =>
      [department.label, ...department.keywords].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [departments, query]);

  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("hf-admin-sidebar");
      queueMicrotask(() => setCollapsed(stored === "collapsed"));
    } catch {
      queueMicrotask(() => setCollapsed(false));
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "hf-admin-sidebar",
        collapsed ? "collapsed" : "expanded"
      );
    } catch {
      // Storage is optional.
    }
  }, [collapsed]);

  useEffect(() => {
    if (!drawerOpen) {
      hamburgerRef.current?.focus();
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("input,button,a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),input:not([disabled])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [drawerOpen]);

  function submitTicketSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = ticketSearch.trim();
    if (value)
      router.push(`/admin/operations?ref=${encodeURIComponent(value)}`);
  }

  function navigation(closeDrawer = false) {
    if (closeDrawer) setDrawerOpen(false);
  }

  const sidebar = (mobile = false) => (
    <nav aria-label="Admin navigation" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <label
          htmlFor={`admin-department-search${mobile ? "-mobile" : ""}`}
          className="sr-only"
        >
          Search departments
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            id={`admin-department-search${mobile ? "-mobile" : ""}`}
            aria-label="Search departments"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            placeholder="Search"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} departments
        </p>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {filtered.map((department, index) => {
          const active = current?.id === department.id;
          const content = (
            <>
              <DepartmentIcon name={department.icon} />
              <span className={collapsed && !mobile ? "sr-only" : "truncate"}>
                {department.label}
              </span>
              {!department.available && !(collapsed && !mobile) && (
                <span className="ml-auto text-[0.68rem] text-muted-foreground">
                  Planned
                </span>
              )}
            </>
          );
          return (
            <li
              key={department.id}
              className="hf-adm-nav-in relative"
              style={{ animationDelay: `${Math.min(index, 14) * 0.03}s` }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-primary to-[var(--adm-accent-2)]"
                />
              )}
              {department.available ? (
                <Link
                  href={department.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigation(true)}
                  className={`v2-touch flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                    active
                      ? "hf-pill-in bg-secondary font-semibold text-secondary-foreground"
                      : "hf-navlink text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="v2-touch flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="flex min-h-16 items-center gap-3 px-4">
          <button
            ref={hamburgerRef}
            type="button"
            className="v2-touch inline-flex items-center justify-center rounded-xl hover:bg-muted lg:hidden"
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            onClick={() => {
              if (drawerOpen) {
                setDrawerOpen(false);
                return;
              }
              setQuery("");
              setDrawerOpen(true);
            }}
          >
            {drawerOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
          <button
            type="button"
            className="v2-touch hidden items-center justify-center rounded-xl hover:bg-muted lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRight aria-hidden />
            ) : (
              <ChevronLeft aria-hidden />
            )}
          </button>
          <Link
            href="/admin/operations"
            className="hf-logo hidden shrink-0 sm:flex"
            aria-label="HelpDesk First operations home"
          >
            <BrandMark className="h-8 w-8" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-lg font-extrabold">
            {current?.label ?? "Admin"}
          </p>
          <form
            onSubmit={submitTicketSearch}
            className="hidden min-w-0 flex-1 max-w-sm md:block"
          >
            <label htmlFor="admin-ticket-search" className="sr-only">
              Search tickets
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                id="admin-ticket-search"
                aria-label="Search tickets"
                value={ticketSearch}
                onChange={(event) => setTicketSearch(event.target.value)}
                placeholder="Search tickets"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
              />
            </div>
          </form>
          <div className="flex items-center gap-1">
            {isPlatformAdmin ? (
              <Link
                href="/admin/organizations"
                className="hidden rounded-xl px-3 py-2 text-sm hover:bg-muted sm:inline-flex"
              >
                Organizations
              </Link>
            ) : (
              <span
                className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline"
                title={organizationName}
              >
                {organizationName}
              </span>
            )}
            <Link
              href="/admin/notifications"
              className="hf-adm-ring v2-touch relative inline-flex items-center justify-center rounded-xl border border-border bg-card hover:bg-muted"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              {pendingNotifications > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-extrabold text-white"
                  aria-label={`${pendingNotifications} pending notifications`}
                >
                  {pendingNotifications > 9 ? "9+" : pendingNotifications}
                </span>
              )}
            </Link>
            <details className="relative">
              <summary className="v2-touch flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-bold hover:bg-muted">
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#ffc24b] to-[#f472b6] text-xs font-extrabold text-[#1c1633]"
                >
                  {roleLabel.charAt(0).toUpperCase()}
                </span>
                {roleLabel}
              </summary>
              <div className="absolute right-0 top-12 z-50 min-w-48 rounded-xl border border-border bg-card p-3 shadow-md">
                <p className="mb-2 text-xs text-muted-foreground">
                  {roleLabel}
                </p>
                <AdminThemeToggle />
                <form action={adminLogout} className="mt-2">
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          id="admin-sidebar"
          className={`hidden shrink-0 border-r border-border bg-card lg:flex lg:flex-col ${
            collapsed ? "w-16" : "w-68"
          }`}
        >
          {sidebar()}
        </aside>
        {drawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Admin navigation"
              className="flex h-full w-[min(18rem,85vw)] flex-col bg-card shadow-md"
              onClick={(event) => event.stopPropagation()}
            >
              {sidebar(true)}
            </aside>
          </div>
        )}
        <div role="main" className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
