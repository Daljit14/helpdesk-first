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
  HeartPulse,
  Laptop,
  Sparkles,
  UserCheck,
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
  pulse: HeartPulse,
  laptop: Laptop,
  sparkles: Sparkles,
  match: UserCheck,
} as const;

/** Accent colour per sidebar group, used for the icon tiles. */
const GROUP_TINT: Record<string, string> = {
  Overview: "bg-[#7c5cff]/15 text-[#6d4aff] dark:text-[#b9a2ff]",
  Support: "bg-[#0ea5e9]/15 text-[#0284c7] dark:text-[#7dd3fc]",
  People: "bg-[#f59e0b]/15 text-[#b45309] dark:text-[#fcd34d]",
  "Data & security": "bg-[#f43f5e]/15 text-[#be123c] dark:text-[#fda4af]",
  Configure: "bg-[#10b981]/15 text-[#047857] dark:text-[#6ee7b7]",
};

type StatusState = "ok" | "degraded" | "down" | "unknown";

/** Tiny live health indicator in the sidebar footer (polls /api/status). */
function SidebarStatus({ compact }: { compact: boolean }) {
  const [state, setState] = useState<StatusState>("unknown");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const body = (await response.json()) as {
          ok: boolean;
          degraded?: boolean;
        };
        if (!cancelled)
          setState(body.ok ? (body.degraded ? "degraded" : "ok") : "down");
      } catch {
        if (!cancelled) setState("unknown");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  const label = {
    ok: "All systems operational",
    degraded: "Running with warnings",
    down: "Issue detected",
    unknown: "Checking status…",
  }[state];
  const dot = {
    ok: "bg-status-success",
    degraded: "bg-status-warning",
    down: "bg-status-danger",
    unknown: "bg-muted-foreground",
  }[state];
  return (
    <Link
      href="/admin/status"
      title={label}
      className={`group flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 text-xs font-bold transition-colors hover:border-primary/40 hover:bg-muted ${
        compact ? "justify-center p-2.5" : "px-3 py-2.5"
      }`}
    >
      <span className="relative h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className={`hf-ping absolute inset-0 rounded-full ${dot}`} />
        <span className={`absolute inset-0 rounded-full ${dot}`} />
      </span>
      <span className={compact ? "sr-only" : "min-w-0 flex-1 truncate"}>
        {label}
      </span>
      {!compact && (
        <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
          →
        </span>
      )}
    </Link>
  );
}

export function departmentForPath(
  pathname: string,
  searchParams: { get(name: string): string | null },
  departments: Department[],
  hash = ""
) {
  const byId = (id: string) =>
    departments.find((department) => department.id === id) ?? departments[0];
  const queue = searchParams.get("queue");
  const ticketsView =
    pathname.startsWith("/admin/tickets") ||
    (pathname === "/admin/operations" &&
      (Boolean(queue) || hash === "#tickets"));
  if (ticketsView) {
    if (queue === "ai_working") return byId("ai-investigations");
    if (queue === "needs_human") return byId("capability-matching");
    return byId("ticket-queue");
  }
  if (pathname === "/admin/operations" && hash === "#analytics")
    return byId("analytics");
  return (
    departments.find((department) => {
      const path = department.href.split("?")[0].split("#")[0];
      return (
        pathname === path ||
        (path !== "/admin/operations" && pathname.startsWith(`${path}/`))
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
    if (value) router.push(`/admin/tickets?ref=${encodeURIComponent(value)}`);
  }

  function navigation(closeDrawer = false) {
    if (closeDrawer) setDrawerOpen(false);
  }

  const sidebar = (mobile = false) => {
    const compact = collapsed && !mobile;
    const groups: { name: string | null; items: Department[] }[] = [];
    for (const department of filtered) {
      const name = department.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.items.push(department);
      else groups.push({ name, items: [department] });
    }
    let order = 0;
    return (
      <nav
        aria-label="Admin navigation"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className={`border-b border-border ${compact ? "p-2" : "p-3"}`}>
          <label
            htmlFor={`admin-department-search${mobile ? "-mobile" : ""}`}
            className="sr-only"
          >
            Search departments
          </label>
          <div
            className={`flex items-center gap-2 rounded-xl border border-border bg-muted/50 transition-colors focus-within:border-primary/50 focus-within:bg-card ${
              compact ? "justify-center px-2" : "px-3"
            }`}
          >
            <Search
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              id={`admin-department-search${mobile ? "-mobile" : ""}`}
              aria-label="Search departments"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`min-w-0 flex-1 bg-transparent py-2 text-sm outline-none ${
                compact ? "sr-only" : ""
              }`}
              placeholder="Search departments"
            />
          </div>
          <p
            className={`mt-2 px-1 text-[11px] font-bold text-muted-foreground ${
              compact ? "sr-only" : ""
            }`}
            aria-live="polite"
          >
            {filtered.length} departments
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 && !compact && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No department matches “{query}”.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.name ?? "all"} className="mb-2">
              {group.name && !compact && (
                <p className="px-2 pb-1 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground/80">
                  {group.name}
                </p>
              )}
              {group.name && compact && (
                <span
                  aria-hidden
                  className="mx-auto my-2 block h-px w-6 bg-border"
                />
              )}
              <ul className="space-y-0.5">
                {group.items.map((department) => {
                  const active = current?.id === department.id;
                  const index = order++;
                  const tint =
                    GROUP_TINT[department.group ?? ""] ??
                    "bg-muted text-muted-foreground";
                  const badge =
                    department.id === "notifications" &&
                    pendingNotifications > 0
                      ? pendingNotifications > 9
                        ? "9+"
                        : String(pendingNotifications)
                      : null;
                  const Icon =
                    icons[department.icon as keyof typeof icons] ?? Activity;
                  const content = (
                    <>
                      <span
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:scale-110 ${
                          active ? "bg-white/20 text-white" : tint
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {badge && compact && (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-destructive" />
                        )}
                      </span>
                      <span
                        className={
                          compact ? "sr-only" : "min-w-0 flex-1 truncate"
                        }
                      >
                        {department.label}
                      </span>
                      {badge && !compact && (
                        <span
                          className={`rounded-full px-1.5 text-[10px] font-extrabold ${
                            active
                              ? "bg-white/25 text-white"
                              : "bg-destructive text-white"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                      {!department.available && !compact && (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground">
                          Planned
                        </span>
                      )}
                    </>
                  );
                  const base = `group v2-touch flex items-center gap-3 rounded-2xl text-[13.5px] ${
                    compact ? "justify-center p-1.5" : "py-1.5 pl-1.5 pr-3"
                  }`;
                  return (
                    <li
                      key={department.id}
                      className="hf-adm-nav-in relative"
                      style={{
                        animationDelay: `${Math.min(index, 16) * 0.03}s`,
                      }}
                    >
                      {department.available ? (
                        <Link
                          href={department.href}
                          title={compact ? department.label : undefined}
                          aria-current={active ? "page" : undefined}
                          onClick={() => navigation(true)}
                          className={`${base} ${
                            active
                              ? "hf-pill-in bg-gradient-to-r from-primary to-[var(--adm-accent-2)] font-extrabold text-white shadow-[0_10px_24px_-12px_var(--primary)]"
                              : "font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {content}
                        </Link>
                      ) : (
                        <span
                          aria-disabled="true"
                          title={compact ? department.label : undefined}
                          className={`${base} cursor-not-allowed font-semibold text-muted-foreground opacity-70`}
                        >
                          {content}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className={`border-t border-border ${compact ? "p-2" : "p-3"}`}>
          <SidebarStatus compact={compact} />
        </div>
      </nav>
    );
  };

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
          className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 border-r border-border bg-card transition-[width] duration-300 lg:flex lg:flex-col ${
            collapsed ? "w-[76px]" : "w-72"
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
        <div role="main" className="min-w-0 flex-1 overflow-x-clip">
          {children}
        </div>
      </div>
    </div>
  );
}
