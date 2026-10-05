import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Globe2,
  LogIn,
  Search,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import {
  EmptyState,
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  StatusPill,
} from "@/components/admin/ui/admin-kit";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  formatRelativeTime,
  loadUsersOverview,
  parseUsersFilter,
  type LoginStatus,
  type SignInMethod,
  type UsersFilter,
  USERS_PAGE_SIZE,
} from "@/lib/admin/users-overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users & logins",
  robots: { index: false, follow: false },
};

const METHOD_LABELS: Record<SignInMethod, string> = {
  google: "Google",
  microsoft: "Microsoft",
  email: "Email",
  other: "Other",
};

const METHOD_STYLES: Record<SignInMethod, string> = {
  google: "bg-status-info/10 text-status-info",
  microsoft: "bg-primary/10 text-primary",
  email: "bg-secondary text-secondary-foreground",
  other: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<LoginStatus, string> = {
  today: "Today",
  week: "This week",
  inactive: "Inactive",
  never: "Never signed in",
};

function statusTone(status: LoginStatus) {
  if (status === "today" || status === "week") return "good";
  if (status === "never") return "warn";
  return "neutral";
}

function pageHref(filter: UsersFilter, page: number) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.method) params.set("method", filter.method);
  if (filter.status) params.set("status", filter.status);
  params.set("page", String(page));
  return `/admin/users?${params.toString()}`;
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminPage("/admin/users");
  if (session.role !== "org_admin" && !session.isPlatformAdmin) notFound();

  const filter = parseUsersFilter(await searchParams);
  const overview = await loadUsersOverview(
    {
      organizationId: session.isPlatformAdmin ? null : session.organizationId,
    },
    filter
  );
  const firstItem =
    overview.filteredTotal === 0
      ? 0
      : (overview.page - 1) * USERS_PAGE_SIZE + 1;
  const lastItem = Math.min(
    overview.page * USERS_PAGE_SIZE,
    overview.filteredTotal
  );

  return (
    <AdminPage>
      <AdminHero
        eyebrow="People"
        title="Users & logins"
        description="Who has signed in, how they sign in, and when."
        icon={LogIn}
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Total users" value={overview.total} />
          <HeroChip
            label="Signed in today"
            value={overview.counts.today}
            pulse={overview.counts.today > 0}
          />
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Signed in today"
          value={overview.counts.today}
          icon={Clock3}
          tone="good"
          index={0}
        />
        <StatTile
          label="Signed in this week"
          value={overview.counts.week}
          icon={CalendarDays}
          tone="info"
          index={1}
        />
        <StatTile
          label="Never signed in"
          value={overview.counts.never}
          icon={UserRoundX}
          tone="warn"
          index={2}
        />
        <StatTile
          label="Signed in with Google"
          value={overview.counts.google}
          icon={Globe2}
          index={3}
        />
      </StatGrid>

      <Panel
        title="User accounts"
        description="Sign-in methods and recent activity from Supabase Auth."
        icon={UsersRound}
      >
        <form
          method="get"
          action="/admin/users"
          className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_200px_auto]"
        >
          <label className="min-w-0 text-sm font-bold">
            <span className="mb-1.5 block text-muted-foreground">
              Search users
            </span>
            <input
              type="search"
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="Name or email"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="text-sm font-bold">
            <span className="mb-1.5 block text-muted-foreground">
              Sign-in method
            </span>
            <select
              name="method"
              defaultValue={filter.method ?? ""}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">All methods</option>
              <option value="google">Google</option>
              <option value="microsoft">Microsoft</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className="text-sm font-bold">
            <span className="mb-1.5 block text-muted-foreground">Status</span>
            <select
              name="status"
              defaultValue={filter.status ?? ""}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">All statuses</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="inactive">Inactive</option>
              <option value="never">Never signed in</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              <Search className="h-4 w-4" aria-hidden />
              Apply
            </button>
          </div>
        </form>

        {overview.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    User
                  </th>
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    Sign-in
                  </th>
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    Last sign-in
                  </th>
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    Joined
                  </th>
                  <th scope="col" className="px-3 py-3 font-extrabold">
                    Email confirmed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="max-w-[320px] px-3 py-3">
                      <p className="truncate font-bold">{row.email || "—"}</p>
                      {row.name && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {row.name}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.methods.map((method) => (
                          <span
                            key={method}
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${METHOD_STYLES[method]}`}
                          >
                            {METHOD_LABELS[method]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.lastSignInAt ? (
                        <time
                          dateTime={row.lastSignInAt}
                          title={row.lastSignInAt}
                          className="font-semibold"
                        >
                          {formatRelativeTime(row.lastSignInAt)}
                        </time>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill tone={statusTone(row.status)}>
                        {STATUS_LABELS[row.status]}
                      </StatusPill>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      <time dateTime={row.createdAt} title={row.createdAt}>
                        {displayDate(row.createdAt)}
                      </time>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {row.emailConfirmed ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No users match these filters"
            body="Try a different name, email, sign-in method, or status."
          />
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm font-semibold text-muted-foreground">
            Showing {firstItem}–{lastItem} of {overview.filteredTotal}
          </p>
          <nav aria-label="User pages" className="flex items-center gap-2">
            <Link
              href={pageHref(filter, Math.max(1, overview.page - 1))}
              aria-disabled={overview.page <= 1}
              tabIndex={overview.page <= 1 ? -1 : undefined}
              className={`rounded-lg border border-border px-3 py-2 text-sm font-bold ${
                overview.page <= 1
                  ? "pointer-events-none text-muted-foreground opacity-50"
                  : "hover:bg-muted"
              }`}
            >
              Prev
            </Link>
            <span className="min-w-16 text-center text-xs font-bold text-muted-foreground">
              {overview.page} / {overview.pageCount}
            </span>
            <Link
              href={pageHref(
                filter,
                Math.min(overview.pageCount, overview.page + 1)
              )}
              aria-disabled={overview.page >= overview.pageCount}
              tabIndex={overview.page >= overview.pageCount ? -1 : undefined}
              className={`rounded-lg border border-border px-3 py-2 text-sm font-bold ${
                overview.page >= overview.pageCount
                  ? "pointer-events-none text-muted-foreground opacity-50"
                  : "hover:bg-muted"
              }`}
            >
              Next
            </Link>
          </nav>
        </div>
      </Panel>
    </AdminPage>
  );
}
