import { createAdminClient } from "@/lib/supabase/admin";

export type DbSection = {
  key:
    | "users"
    | "organizations"
    | "members"
    | "tickets"
    | "agent_sessions"
    | "resolution_runs"
    | "devices"
    | "attachments"
    | "notifications"
    | "ai_calls"
    | "audit"
    | "ticket_events"
    | "analytics";
  label: string;
  count: number | null;
  columns: string[];
  rows: Record<string, string | number | null>[];
  error?: string;
};

export type DbOverview = {
  generatedAt: string;
  sections: DbSection[];
};

export type LiveEvent = {
  id: string;
  kind:
    | "signup"
    | "login"
    | "ticket_created"
    | "ticket_updated"
    | "agent_session"
    | "run"
    | "device"
    | "attachment"
    | "notification"
    | "ai_call"
    | "audit"
    | "member_joined";
  at: string;
  title: string;
  detail?: string;
  href?: string;
};

type Scope = { organizationId: string | null };
type AdminClient = ReturnType<typeof createAdminClient>;
type QueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
  count?: number | null;
};
type Query = {
  select(...args: unknown[]): Query;
  eq(...args: unknown[]): Query;
  in(...args: unknown[]): Query;
  gt(...args: unknown[]): Query;
  order(...args: unknown[]): Query;
  limit(...args: unknown[]): Query;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
};
type Row = Record<string, unknown>;

type SectionDefinition = {
  key: DbSection["key"];
  label: string;
  table: string;
  select: string;
  countColumn: string;
  orderColumn: string;
  columns: string[];
  organizationColumn?: string;
};

const sectionDefinitions: SectionDefinition[] = [
  {
    key: "organizations",
    label: "Organizations",
    table: "organizations",
    select: "id,name,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: ["name", "created_at"],
  },
  {
    key: "members",
    label: "Members",
    table: "organization_members",
    select: "organization_id,user_id,role,joined_via,created_at",
    countColumn: "user_id",
    orderColumn: "created_at",
    columns: ["user_id", "role", "joined_via", "created_at"],
    organizationColumn: "organization_id",
  },
  {
    key: "tickets",
    label: "Tickets",
    table: "tickets",
    select:
      "id,organization_id,issue_title,status,priority,platform,created_at,updated_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "issue_title",
      "status",
      "priority",
      "platform",
      "created_at",
      "updated_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "agent_sessions",
    label: "Agent sessions",
    table: "agent_sessions",
    select:
      "id,organization_id,requester_id,status,started_at,updated_at,ended_at",
    countColumn: "id",
    orderColumn: "started_at",
    columns: [
      "id",
      "requester_id",
      "status",
      "started_at",
      "updated_at",
      "ended_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "resolution_runs",
    label: "Resolution runs",
    table: "resolution_runs",
    select:
      "id,organization_id,ticket_id,status,created_at,updated_at,completed_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: ["id", "ticket_id", "status", "created_at", "updated_at"],
    organizationColumn: "organization_id",
  },
  {
    key: "devices",
    label: "Devices",
    table: "devices",
    select:
      "id,organization_id,user_id,hostname,platform,status,enrolled_at,last_seen_at",
    countColumn: "id",
    orderColumn: "enrolled_at",
    columns: [
      "id",
      "user_id",
      "hostname",
      "platform",
      "status",
      "enrolled_at",
      "last_seen_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "attachments",
    label: "Attachments",
    table: "ticket_attachments",
    select:
      "id,organization_id,ticket_id,uploader_id,original_name,status,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "ticket_id",
      "uploader_id",
      "original_name",
      "status",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "notifications",
    label: "Notifications",
    table: "notification_outbox",
    select:
      "id,organization_id,ticket_id,event_type,channel,recipient_user_id,status,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "ticket_id",
      "event_type",
      "channel",
      "recipient_user_id",
      "status",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "ai_calls",
    label: "AI calls",
    table: "ai_provider_calls",
    select:
      "id,organization_id,provider,model,outcome,decision,latency_ms,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "provider",
      "model",
      "outcome",
      "decision",
      "latency_ms",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "audit",
    label: "Audit",
    table: "operations_audit",
    select:
      "id,organization_id,actor_user_id,actor_role,action,target,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "actor_user_id",
      "actor_role",
      "action",
      "target",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "ticket_events",
    label: "Ticket events",
    table: "ticket_events",
    select:
      "id,ticket_id,organization_id,event_type,from_value,to_value,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "ticket_id",
      "event_type",
      "from_value",
      "to_value",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
  {
    key: "analytics",
    label: "Analytics",
    table: "analytics_events",
    select:
      "id,organization_id,event_type,path,issue_id,visitor_key,platform,created_at",
    countColumn: "id",
    orderColumn: "created_at",
    columns: [
      "id",
      "event_type",
      "path",
      "issue_id",
      "visitor_key",
      "platform",
      "created_at",
    ],
    organizationColumn: "organization_id",
  },
];

const usersColumns = ["email", "provider", "created_at", "last_sign_in_at"];

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local?.slice(0, 1) ?? "*"}***@${domain}`;
}

function serialValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function flatten(
  row: Row,
  columns: string[]
): Record<string, string | number | null> {
  return Object.fromEntries(
    columns.map((column) => [column, serialValue(row[column])])
  );
}

function applyOrganizationScope(
  query: Query,
  definition: SectionDefinition,
  scope: Scope
): Query {
  if (scope.organizationId && definition.organizationColumn) {
    return query.eq(definition.organizationColumn, scope.organizationId);
  }
  if (scope.organizationId && definition.key === "organizations") {
    return query.eq("id", scope.organizationId);
  }
  return query;
}

async function loadSection(
  admin: AdminClient,
  definition: SectionDefinition,
  scope: Scope
): Promise<DbSection> {
  let rowsQuery = admin
    .from(definition.table)
    .select(definition.select)
    .order(definition.orderColumn, { ascending: false })
    .limit(15) as unknown as Query;
  let countQuery = admin.from(definition.table).select(definition.countColumn, {
    count: "exact",
    head: true,
  }) as unknown as Query;
  rowsQuery = applyOrganizationScope(rowsQuery, definition, scope);
  countQuery = applyOrganizationScope(countQuery, definition, scope);
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    rowsQuery,
    countQuery,
  ]);
  if (error) throw error;
  if (countError) throw countError;
  return {
    key: definition.key,
    label: definition.label,
    count: count ?? 0,
    columns: definition.columns,
    rows: ((data as unknown as Row[] | null) ?? []).map((row) =>
      flatten(row, definition.columns)
    ),
  };
}

async function loadUsers(
  admin: AdminClient,
  scope: Scope,
  userIds: string[] | null
): Promise<DbSection> {
  let rowsQuery = admin
    .from("admin_auth_users")
    .select("id,email,provider,created_at,last_sign_in_at")
    .order("created_at", { ascending: false })
    .limit(15) as unknown as Query;
  let countQuery = admin
    .from("admin_auth_users")
    .select("id", { count: "exact", head: true }) as unknown as Query;
  if (userIds) {
    rowsQuery = rowsQuery.in("id", userIds);
    countQuery = countQuery.in("id", userIds);
  }
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    rowsQuery,
    countQuery,
  ]);
  if (error || countError) {
    const message = String(error?.message ?? countError?.message ?? "");
    if (/admin_auth_users/i.test(message)) {
      throw new Error(
        "View admin_auth_users missing — run supabase/admin-database.sql"
      );
    }
    throw error ?? countError;
  }
  return {
    key: "users",
    label: "Users & logins",
    count: count ?? 0,
    columns: usersColumns,
    rows: ((data as unknown as Row[] | null) ?? []).map((row) => ({
      id: serialValue(row.id),
      ...flatten(row, usersColumns),
    })),
  };
}

function failedSection(
  definition: Pick<SectionDefinition, "key" | "label" | "columns">,
  error: unknown
): DbSection {
  return {
    key: definition.key,
    label: definition.label,
    count: null,
    columns: definition.columns,
    rows: [],
    error: error instanceof Error ? error.message : "Unable to load section.",
  };
}

async function organizationMemberIds(
  admin: AdminClient,
  scope: Scope
): Promise<string[] | null> {
  if (!scope.organizationId) return null;
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", scope.organizationId);
  if (error) throw error;
  return (data ?? []).map((row: { user_id: string }) => row.user_id);
}

export async function loadDbOverview(scope: Scope): Promise<DbOverview> {
  const admin = createAdminClient();
  let userIds: string[] | null = null;
  let memberError: unknown;
  if (scope.organizationId) {
    try {
      userIds = await organizationMemberIds(admin, scope);
    } catch (error) {
      memberError = error;
      userIds = [];
    }
  }
  const loaded = await Promise.all(
    sectionDefinitions.map(async (definition) => {
      if (definition.key === "members" && memberError) {
        return failedSection(definition, memberError);
      }
      try {
        return await loadSection(admin, definition, scope);
      } catch (error) {
        return failedSection(definition, error);
      }
    })
  );
  let users: DbSection;
  try {
    users = await loadUsers(admin, scope, userIds);
  } catch (error) {
    users = {
      ...failedSection(
        { key: "users", label: "Users & logins", columns: usersColumns },
        error
      ),
      columns: usersColumns,
    };
  }
  const sections = [users, ...loaded];
  return { generatedAt: new Date().toISOString(), sections };
}

type EventQuery = {
  table: string;
  select: string;
  orderColumn: string;
  organizationColumn?: string;
  kind: LiveEvent["kind"];
  map: (row: Row, kind: LiveEvent["kind"]) => LiveEvent | null;
};

function eventId(kind: LiveEvent["kind"], row: Row, at: string): string {
  return `${kind}:${String(row.id ?? row.ticket_id ?? row.user_id ?? "row")}:${at}`;
}

function eventAt(row: Row, column: string): string | null {
  const value = row[column];
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const at = value instanceof Date ? value.toISOString() : value;
  return Number.isNaN(Date.parse(at)) ? null : new Date(at).toISOString();
}

function scopedEventQuery(
  query: Query,
  event: EventQuery,
  scope: Scope
): Query {
  return scope.organizationId && event.organizationColumn
    ? query.eq(event.organizationColumn, scope.organizationId)
    : query;
}

const liveEventQueries: EventQuery[] = [
  {
    table: "tickets",
    select: "id,organization_id,issue_title,status,created_at,updated_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "ticket_created",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `Ticket created: ${String(row.issue_title ?? "Untitled ticket")}`,
        detail: String(row.status ?? ""),
        href: `/admin/tickets/${String(row.id)}`,
      };
    },
  },
  {
    table: "tickets",
    select: "id,organization_id,issue_title,status,created_at,updated_at",
    orderColumn: "updated_at",
    organizationColumn: "organization_id",
    kind: "ticket_updated",
    map: (row, kind) => {
      const at = eventAt(row, "updated_at");
      if (
        !at ||
        typeof row.created_at !== "string" ||
        new Date(row.created_at).toISOString() === at
      )
        return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `Ticket updated: ${String(row.issue_title ?? "Untitled ticket")}`,
        detail: String(row.status ?? ""),
        href: `/admin/tickets/${String(row.id)}`,
      };
    },
  },
  {
    table: "agent_sessions",
    select: "id,organization_id,status,started_at,updated_at",
    orderColumn: "started_at",
    organizationColumn: "organization_id",
    kind: "agent_session",
    map: (row, kind) => {
      const at = eventAt(row, "started_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: "Agent session started",
        detail: String(row.status ?? ""),
      };
    },
  },
  {
    table: "resolution_runs",
    select: "id,organization_id,ticket_id,status,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "run",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: "Resolution run started",
        detail: String(row.status ?? ""),
        href: `/admin/resolution/${String(row.id)}`,
      };
    },
  },
  {
    table: "devices",
    select: "id,organization_id,hostname,platform,status,enrolled_at",
    orderColumn: "enrolled_at",
    organizationColumn: "organization_id",
    kind: "device",
    map: (row, kind) => {
      const at = eventAt(row, "enrolled_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `Device enrolled: ${String(row.hostname ?? "Unknown device")}`,
        detail: `${String(row.platform ?? "")} · ${String(row.status ?? "")}`,
      };
    },
  },
  {
    table: "ticket_attachments",
    select: "id,organization_id,ticket_id,status,original_name,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "attachment",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `Attachment: ${String(row.original_name ?? "uploaded file")}`,
        detail: String(row.status ?? ""),
        href: row.ticket_id
          ? `/admin/tickets/${String(row.ticket_id)}`
          : undefined,
      };
    },
  },
  {
    table: "notification_outbox",
    select: "id,organization_id,event_type,channel,status,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "notification",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: "Notification queued",
        detail: `${String(row.event_type ?? "")} · ${String(row.channel ?? "")} · ${String(row.status ?? "")}`,
      };
    },
  },
  {
    table: "ai_provider_calls",
    select: "id,organization_id,provider,model,outcome,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "ai_call",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `AI call: ${String(row.provider ?? "provider")}`,
        detail: `${String(row.model ?? "")} · ${String(row.outcome ?? "")}`,
      };
    },
  },
  {
    table: "operations_audit",
    select: "id,organization_id,actor_role,action,target,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "audit",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: `Audit: ${String(row.action ?? "activity")}`,
        detail: [row.actor_role, row.target].filter(Boolean).join(" · "),
      };
    },
  },
  {
    table: "organization_members",
    select: "organization_id,user_id,role,created_at",
    orderColumn: "created_at",
    organizationColumn: "organization_id",
    kind: "member_joined",
    map: (row, kind) => {
      const at = eventAt(row, "created_at");
      if (!at) return null;
      return {
        id: eventId(kind, row, at),
        kind,
        at,
        title: "Member joined",
        detail: `${String(row.role ?? "")} · ${String(row.user_id ?? "")}`,
      };
    },
  },
];

async function eventRows(
  admin: AdminClient,
  event: EventQuery,
  scope: Scope,
  since: string,
  userIds?: string[] | null
): Promise<Row[]> {
  let query = admin
    .from(event.table)
    .select(event.select)
    .gt(event.orderColumn, since)
    .order(event.orderColumn, { ascending: false })
    .limit(50) as unknown as Query;
  query = scopedEventQuery(query, event, scope);
  if (event.table === "admin_auth_users" && userIds) {
    query = query.in("id", userIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as Row[] | null) ?? [];
}

export async function loadLiveEvents(
  scope: Scope,
  since: string,
  limit = 50
): Promise<{ events: LiveEvent[]; cursor: string }> {
  const admin = createAdminClient();
  let userIds: string[] | null = null;
  if (scope.organizationId) {
    try {
      userIds = await organizationMemberIds(admin, scope);
    } catch {
      userIds = [];
    }
  }
  const usersSince: EventQuery[] = [
    {
      table: "admin_auth_users",
      select: "id,email,provider,created_at",
      orderColumn: "created_at",
      kind: "signup",
      map: (row, kind) => {
        const at = eventAt(row, "created_at");
        if (!at) return null;
        const email = String(row.email ?? "unknown account");
        return {
          id: eventId(kind, row, at),
          kind,
          at,
          title: `New account: ${maskEmail(email)}`,
          detail: String(row.provider ?? "email"),
        };
      },
    },
    {
      table: "admin_auth_users",
      select: "id,email,last_sign_in_at,provider",
      orderColumn: "last_sign_in_at",
      kind: "login",
      map: (row, kind) => {
        const at = eventAt(row, "last_sign_in_at");
        if (!at) return null;
        return {
          id: eventId(kind, row, at),
          kind,
          at,
          title: `Login: ${maskEmail(String(row.email ?? "unknown account"))}`,
          detail: String(row.provider ?? "email"),
        };
      },
    },
  ];
  const results = await Promise.allSettled([
    ...usersSince.map((event) =>
      eventRows(admin, event, scope, since, userIds)
    ),
    ...liveEventQueries.map((event) => eventRows(admin, event, scope, since)),
  ]);
  const events = results.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const query =
      index < usersSince.length
        ? usersSince[index]
        : liveEventQueries[index - usersSince.length];
    return result.value
      .map((row) => query.map(row, query.kind))
      .filter((event): event is LiveEvent => event !== null);
  });
  const unique = new Map(events.map((event) => [event.id, event]));
  const sorted = [...unique.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
  const cursor = sorted.reduce(
    (latest, event) =>
      Date.parse(event.at) > Date.parse(latest) ? event.at : latest,
    since
  );
  return { events: sorted, cursor };
}
