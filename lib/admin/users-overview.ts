import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignInMethod = "google" | "microsoft" | "email" | "other";
export type LoginStatus = "today" | "week" | "inactive" | "never";
export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  methods: SignInMethod[];
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  status: LoginStatus;
};
export type UsersFilter = {
  q?: string;
  method?: SignInMethod;
  status?: LoginStatus;
  page?: number;
};
export type UsersOverview = {
  rows: AdminUserRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageCount: number;
  counts: {
    today: number;
    week: number;
    never: number;
    google: number;
    microsoft: number;
    email: number;
  };
};

export const USERS_PAGE_SIZE = 50;

const SIGN_IN_METHODS: SignInMethod[] = [
  "google",
  "microsoft",
  "email",
  "other",
];
const LOGIN_STATUSES: LoginStatus[] = ["today", "week", "inactive", "never"];
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_PAGE_SIZE = 1000;
const AUTH_PAGE_CAP = 20;

function isOneOf<T extends string>(
  value: string,
  options: readonly T[]
): value is T {
  return options.includes(value as T);
}

function providerMethod(provider: string): SignInMethod {
  if (provider === "azure") return "microsoft";
  if (provider === "google" || provider === "email") return provider;
  return "other";
}

export function normalizeMethods(
  appMetadata: Record<string, unknown> | undefined
): SignInMethod[] {
  const providers = Array.isArray(appMetadata?.providers)
    ? appMetadata.providers.filter(
        (provider): provider is string => typeof provider === "string"
      )
    : [];
  const fallback =
    typeof appMetadata?.provider === "string" ? [appMetadata.provider] : [];
  const methods = (providers.length > 0 ? providers : fallback).map(
    providerMethod
  );
  if (methods.length === 0) methods.push("email");

  const found = new Set(methods);
  return SIGN_IN_METHODS.filter((method) => found.has(method));
}

export function loginStatus(
  lastSignInAt: string | null | undefined,
  now: Date
): LoginStatus {
  if (!lastSignInAt) return "never";
  const age = now.getTime() - Date.parse(lastSignInAt);
  if (age < DAY_MS) return "today";
  if (age < 7 * DAY_MS) return "week";
  return "inactive";
}

export function toUserRow(user: User, now: Date): AdminUserRow {
  const metadata = user.user_metadata ?? {};
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const lastSignInAt = user.last_sign_in_at ?? null;

  return {
    id: user.id,
    email: user.email ?? "",
    name,
    methods: normalizeMethods(user.app_metadata),
    createdAt: user.created_at,
    lastSignInAt,
    emailConfirmed: Boolean(user.email_confirmed_at),
    status: loginStatus(lastSignInAt, now),
  };
}

export function filterUsers(
  rows: AdminUserRow[],
  filter: UsersFilter
): AdminUserRow[] {
  const query = filter.q?.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (
      query &&
      !row.email.toLocaleLowerCase().includes(query) &&
      !row.name?.toLocaleLowerCase().includes(query)
    ) {
      return false;
    }
    if (filter.method && !row.methods.includes(filter.method)) return false;
    if (filter.status && row.status !== filter.status) return false;
    return true;
  });
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseUsersFilter(
  params: Record<string, string | string[] | undefined>
): UsersFilter {
  const query = firstString(params.q)?.trim().slice(0, 100);
  const method = firstString(params.method);
  const status = firstString(params.status);
  const rawPage = firstString(params.page);
  const page = rawPage ? Number(rawPage) : 1;

  return {
    ...(query ? { q: query } : {}),
    ...(method && isOneOf(method, SIGN_IN_METHODS) ? { method } : {}),
    ...(status && isOneOf(status, LOGIN_STATUSES) ? { status } : {}),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function formatRelativeTime(
  value: string | null,
  now = new Date()
): string {
  if (!value) return "Never";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Never";

  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - timestamp) / (60 * 1000))
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const weeks = Math.floor(days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
}

type MembershipRow = { user_id: string };

export async function loadUsersOverview(
  scope: { organizationId: string | null },
  filter: UsersFilter,
  now = new Date()
): Promise<UsersOverview> {
  const admin = createAdminClient();
  const users: User[] = [];

  for (let page = 1; page <= AUTH_PAGE_CAP; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(error.message);

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < AUTH_PAGE_SIZE) break;
  }

  let scopedUsers = users;
  if (scope.organizationId) {
    const { data, error } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", scope.organizationId);
    if (error) throw new Error(error.message);
    const memberIds = new Set(
      ((data ?? []) as MembershipRow[]).map((row) => row.user_id)
    );
    scopedUsers = users.filter((user) => memberIds.has(user.id));
  }

  const allRows = scopedUsers.map((user) => toUserRow(user, now));
  const counts = {
    today: allRows.filter((row) => row.status === "today").length,
    week: allRows.filter(
      (row) => row.status === "today" || row.status === "week"
    ).length,
    never: allRows.filter((row) => row.status === "never").length,
    google: allRows.filter((row) => row.methods.includes("google")).length,
    microsoft: allRows.filter((row) => row.methods.includes("microsoft"))
      .length,
    email: allRows.filter((row) => row.methods.includes("email")).length,
  };
  allRows.sort((a, b) => {
    if (a.lastSignInAt && b.lastSignInAt) {
      const signInDifference =
        Date.parse(b.lastSignInAt) - Date.parse(a.lastSignInAt);
      if (signInDifference !== 0) return signInDifference;
    } else if (a.lastSignInAt) {
      return -1;
    } else if (b.lastSignInAt) {
      return 1;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const filtered = filterUsers(allRows, filter);
  const filteredTotal = filtered.length;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / USERS_PAGE_SIZE));
  const requestedPage =
    Number.isInteger(filter.page) && (filter.page ?? 0) >= 1
      ? (filter.page as number)
      : 1;
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * USERS_PAGE_SIZE;

  return {
    rows: filtered.slice(start, start + USERS_PAGE_SIZE),
    total: allRows.length,
    filteredTotal,
    page,
    pageCount,
    counts,
  };
}
