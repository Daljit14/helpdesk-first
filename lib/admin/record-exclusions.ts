import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type ExcludableTable = "tickets" | "resolution_runs";

export async function getExcludedRecordIds(
  admin: Admin,
  organizationId: string,
  table: ExcludableTable
): Promise<Set<string>> {
  const result = await admin
    .from("record_exclusions")
    .select("record_id")
    .eq("organization_id", organizationId)
    .eq("table_name", table);
  if (result.error) throw result.error;
  return new Set(
    ((result.data ?? []) as { record_id: string }[]).map(
      ({ record_id }) => record_id
    )
  );
}

export function withoutExcluded<T extends { id: string }>(
  rows: T[],
  excluded: Set<string>
): T[] {
  return rows.filter((row) => !excluded.has(row.id));
}

export async function excludeRecord(
  admin: Admin,
  input: {
    organizationId: string;
    table: ExcludableTable;
    recordId: string;
    reason: string;
    excludedBy: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await admin.from("record_exclusions").insert({
    organization_id: input.organizationId,
    table_name: input.table,
    record_id: input.recordId,
    reason: input.reason,
    excluded_by: input.excludedBy,
  });
  if (!result.error || result.error.code === "23505") return { ok: true };
  return { ok: false, error: result.error.message };
}
