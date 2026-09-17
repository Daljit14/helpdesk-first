import { isOrgEncryptionEnabled } from "@/lib/security/data-protection-config";
import {
  encryptJson,
  encryptText,
  isEncryptedField,
} from "@/lib/security/field-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type TableName =
  | "tickets"
  | "ticket_comments"
  | "ticket_investigations"
  | "ticket_attachments";
type Target = {
  table: TableName;
  column: string;
  kind: "text" | "json";
  idColumn: "id" | "ticket_id";
};

const targets: Target[] = [
  { table: "tickets", column: "message", kind: "text", idColumn: "id" },
  {
    table: "ticket_comments",
    column: "message",
    kind: "text",
    idColumn: "id",
  },
  {
    table: "ticket_investigations",
    column: "evidence",
    kind: "json",
    idColumn: "ticket_id",
  },
  {
    table: "ticket_investigations",
    column: "escalation_package",
    kind: "json",
    idColumn: "ticket_id",
  },
  {
    table: "ticket_attachments",
    column: "scan_detail",
    kind: "text",
    idColumn: "id",
  },
];

function isEncryptedJson(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { $enc?: unknown }).$enc === "string" &&
    isEncryptedField((value as { $enc: string }).$enc)
  );
}

async function countTarget(
  admin: Admin,
  target: Target,
  organizationId: string
): Promise<{ count: number; truncated: boolean }> {
  const query = admin
    .from(target.table)
    .select(target.idColumn, { count: "exact", head: true })
    .eq("organization_id", organizationId);
  const result =
    target.kind === "text"
      ? await query
          .not(target.column, "is", null)
          .not(target.column, "like", "enc:%")
      : await query;
  if (result.error) throw result.error;
  if (target.kind === "json") {
    const rows = await admin
      .from(target.table)
      .select(`${target.idColumn},${target.column}`)
      .eq("organization_id", organizationId)
      .limit(1000);
    if (rows.error) throw rows.error;
    const data = rows.data ?? [];
    return {
      count: data.filter((row) => {
        const value = (row as unknown as Record<string, unknown>)[
          target.column
        ];
        return value !== null && value !== undefined && !isEncryptedJson(value);
      }).length,
      truncated: data.length === 1000,
    };
  }
  return { count: result.count ?? 0, truncated: false };
}

export type PlaintextCountResult = {
  counts: Record<string, number>;
  truncated: boolean;
};

export async function countPlaintextRowsDetailed(
  admin: Admin,
  organizationId: string
): Promise<PlaintextCountResult> {
  const counts: Record<string, number> = {};
  let truncated = false;
  for (const target of targets) {
    const result = await countTarget(admin, target, organizationId);
    counts[`${target.table}.${target.column}`] = result.count;
    truncated ||= result.truncated;
  }
  return { counts, truncated };
}

export async function countPlaintextRows(
  admin: Admin,
  organizationId: string
): Promise<Record<string, number>> {
  return (await countPlaintextRowsDetailed(admin, organizationId)).counts;
}

async function backfillTarget(
  admin: Admin,
  organizationId: string,
  target: Target,
  batchSize: number
): Promise<{ processed: number; remaining: number }> {
  let query = admin
    .from(target.table)
    .select(`${target.idColumn},organization_id,${target.column}`)
    .eq("organization_id", organizationId);
  let cursor: string | null = null;
  if (target.kind === "text") {
    query = query
      .not(target.column, "is", null)
      .not(target.column, "like", "enc:%");
  } else {
    const progress = await admin
      .from("data_protection_backfill")
      .select("last_processed_id")
      .eq("organization_id", organizationId)
      .eq("table_name", target.table)
      .eq("column_name", target.column)
      .maybeSingle();
    if (progress.error) throw progress.error;
    cursor = progress.data?.last_processed_id
      ? String(progress.data.last_processed_id)
      : null;
    if (cursor) query = query.gt(target.idColumn, cursor);
  }
  const rows = await query
    .order(target.idColumn, { ascending: true })
    .limit(batchSize);
  if (rows.error) throw rows.error;
  let processed = 0;
  for (const row of (rows.data ?? []) as unknown as Array<
    Record<string, unknown> & {
      organization_id: string;
      id?: string | number;
      ticket_id?: string;
    }
  >) {
    const value = row[target.column];
    if (value === null || value === undefined) continue;
    if (
      (target.kind === "text" &&
        (typeof value !== "string" || isEncryptedField(value))) ||
      (target.kind === "json" && isEncryptedJson(value))
    ) {
      continue;
    }
    const encrypted =
      target.kind === "text"
        ? await encryptText(
            admin,
            organizationId,
            { table: target.table, column: target.column },
            String(value ?? "")
          )
        : await encryptJson(
            admin,
            organizationId,
            { table: target.table, column: target.column },
            value
          );
    const updated = await admin
      .from(target.table)
      .update({ [target.column]: encrypted })
      .eq(target.idColumn, row[target.idColumn])
      .eq("organization_id", organizationId);
    if (updated.error) throw updated.error;
    processed += 1;
  }
  const remaining = await countTarget(admin, target, organizationId);
  const lastRowId =
    rows.data && rows.data.length > 0
      ? String(
          (
            rows.data[rows.data.length - 1] as unknown as Record<
              string,
              unknown
            >
          )[target.idColumn]
        )
      : null;
  const nextCursor =
    target.kind === "json" && rows.data && rows.data.length === batchSize
      ? lastRowId
      : null;
  await admin.from("data_protection_backfill").upsert({
    organization_id: organizationId,
    table_name: target.table,
    column_name: target.column,
    last_processed_id: nextCursor,
    encrypted_count: processed,
    plaintext_remaining: remaining.count,
    updated_at: new Date().toISOString(),
  });
  return { processed, remaining: remaining.count };
}

export async function backfillEncryption(
  admin: Admin,
  options: {
    batchSize?: number;
    organizationId?: string;
    timeBudgetMs?: number;
  } = {}
): Promise<
  | { skipped: "disabled" }
  | {
      processed: number;
      remaining: number;
      perTable: Record<string, { processed: number; remaining: number }>;
      exhaustedBudget: boolean;
    }
> {
  if (!isOrgEncryptionEnabled()) return { skipped: "disabled" };
  const organizations = options.organizationId
    ? [options.organizationId]
    : ((await admin.from("organizations").select("id").limit(1000)).data?.map(
        (row: { id: string }) => row.id
      ) ?? []);
  const perTable: Record<string, { processed: number; remaining: number }> = {};
  let processed = 0;
  let remaining = 0;
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 200);
  const timeBudgetMs = Math.max(options.timeBudgetMs ?? 50_000, 0);
  const startedAt = Date.now();
  let pass = 0;
  let exhaustedBudget = false;

  while (pass === 0 || Date.now() - startedAt < timeBudgetMs) {
    pass += 1;
    let passProcessed = 0;
    remaining = 0;
    for (const organizationId of organizations) {
      for (const target of targets) {
        const result = await backfillTarget(
          admin,
          organizationId,
          target,
          batchSize
        );
        const name = `${target.table}.${target.column}`;
        perTable[name] = {
          processed: (perTable[name]?.processed ?? 0) + result.processed,
          remaining: result.remaining,
        };
        processed += result.processed;
        passProcessed += result.processed;
        remaining += result.remaining;
      }
    }
    if (passProcessed === 0) break;
    if (Date.now() - startedAt >= timeBudgetMs) {
      exhaustedBudget = true;
      break;
    }
  }
  return { processed, remaining, perTable, exhaustedBudget };
}
