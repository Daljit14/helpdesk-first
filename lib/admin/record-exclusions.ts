import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type ExcludableTable = "tickets" | "resolution_runs";

let missingTableWarningShown = false;

function isMissingTableError(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    (/record_exclusions/i.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function warnMissingTableOnce() {
  if (missingTableWarningShown) return;
  missingTableWarningShown = true;
  console.warn(
    "record_exclusions is unavailable; continuing without record exclusions until the migration is applied"
  );
}

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
  if (result.error) {
    if (isMissingTableError(result.error)) {
      warnMissingTableOnce();
      return new Set();
    }
    throw result.error;
  }
  return new Set(
    ((result.data ?? []) as { record_id: string }[]).map(
      ({ record_id }) => record_id
    )
  );
}

export async function isRecordExcluded(
  admin: Admin,
  organizationId: string,
  table: ExcludableTable,
  recordId: string
): Promise<boolean> {
  const result = await admin
    .from("record_exclusions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("table_name", table)
    .eq("record_id", recordId)
    .maybeSingle();
  if (result.error) {
    if (isMissingTableError(result.error)) {
      warnMissingTableOnce();
      return false;
    }
    throw result.error;
  }
  return Boolean(result.data);
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
