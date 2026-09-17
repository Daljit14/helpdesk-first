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
};

const targets: Target[] = [
  { table: "tickets", column: "message", kind: "text" },
  { table: "ticket_comments", column: "message", kind: "text" },
  { table: "ticket_investigations", column: "evidence", kind: "json" },
  {
    table: "ticket_investigations",
    column: "escalation_package",
    kind: "json",
  },
  { table: "ticket_attachments", column: "scan_detail", kind: "text" },
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
): Promise<number> {
  const query = admin
    .from(target.table)
    .select("id", { count: "exact", head: true })
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
      .select(`id,${target.column}`)
      .eq("organization_id", organizationId);
    if (rows.error) throw rows.error;
    return (rows.data ?? []).filter((row) => {
      const value = (row as unknown as Record<string, unknown>)[target.column];
      return !isEncryptedJson(value);
    }).length;
  }
  return result.count ?? 0;
}

export async function countPlaintextRows(
  admin: Admin,
  organizationId: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const target of targets) {
    counts[`${target.table}.${target.column}`] = await countTarget(
      admin,
      target,
      organizationId
    );
  }
  return counts;
}

async function backfillTarget(
  admin: Admin,
  organizationId: string,
  target: Target,
  batchSize: number
): Promise<{ processed: number; remaining: number }> {
  const rows = await admin
    .from(target.table)
    .select(`id,organization_id,${target.column}`)
    .eq("organization_id", organizationId)
    .order("id", { ascending: true })
    .limit(batchSize);
  if (rows.error) throw rows.error;
  let processed = 0;
  for (const row of (rows.data ?? []) as unknown as Array<
    Record<string, unknown> & { id: string; organization_id: string }
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
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    if (updated.error) throw updated.error;
    processed += 1;
  }
  const remaining = await countTarget(admin, target, organizationId);
  await admin.from("data_protection_backfill").upsert({
    organization_id: organizationId,
    table_name: target.table,
    column_name: target.column,
    last_processed_id:
      (rows.data?.[rows.data.length - 1] as { id?: string } | undefined)?.id ??
      null,
    encrypted_count: processed,
    plaintext_remaining: remaining,
    updated_at: new Date().toISOString(),
  });
  return { processed, remaining };
}

export async function backfillEncryption(
  admin: Admin,
  options: { batchSize?: number; organizationId?: string } = {}
): Promise<
  | { skipped: "disabled" }
  | {
      processed: number;
      remaining: number;
      perTable: Record<string, { processed: number; remaining: number }>;
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
  for (const organizationId of organizations) {
    for (const target of targets) {
      const result = await backfillTarget(
        admin,
        organizationId,
        target,
        Math.min(Math.max(options.batchSize ?? 200, 1), 200)
      );
      const name = `${target.table}.${target.column}`;
      perTable[name] = {
        processed: (perTable[name]?.processed ?? 0) + result.processed,
        remaining: result.remaining,
      };
      processed += result.processed;
      remaining += result.remaining;
    }
  }
  return { processed, remaining, perTable };
}
