"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import {
  excludeRecord,
  type ExcludableTable,
} from "@/lib/admin/record-exclusions";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  table: z.enum(["tickets", "resolution_runs"]),
  recordId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

export async function excludeRecordAction(input: unknown) {
  const parsed = schema.safeParse(input);
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin" || !parsed.success)
    return { error: "forbidden" as const };
  const result = await excludeRecord(createAdminClient(), {
    organizationId: session.organizationId,
    table: parsed.data.table as ExcludableTable,
    recordId: parsed.data.recordId,
    reason: parsed.data.reason,
    excludedBy: session.userId,
  });
  if (!result.ok) return { error: result.error };
  await recordAudit(
    session,
    "record.excluded",
    `${parsed.data.table}:${parsed.data.recordId} reason:${parsed.data.reason}`
  );
  revalidatePath("/admin/operations");
  revalidatePath("/admin/resolution");
  revalidatePath(`/admin/tickets/${parsed.data.recordId}`);
  revalidatePath(`/admin/resolution/${parsed.data.recordId}`);
  return { success: true };
}
